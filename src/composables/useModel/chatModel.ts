import type { ChatMessageProps } from '@nuxt/ui'
import type { ChatState, ChatStatus, LanguageModelUsage, ModelMessage, UIMessage } from 'ai'
import {
  APICallError,
  Output,
  ToolLoopAgent,
  createIdGenerator,
  isReasoningUIPart,
  isTextUIPart,
} from 'ai'
import type { ShallowReactive } from 'vue'

import type { FormDataAi } from '@/types/formData'
import type { TokenUsageKind } from '@/types/tokenUsage'
import { renderTemplate } from '@/utils/ai'
import { jsonClone } from '@/utils/deepmerge'

import type { ModelConf } from '.'
import type { WorkflowData } from '../useApplying/type'
import type { HelperContext } from '../useHelper'
import { openai } from './openai'

const role = ['system', 'user', 'assistant', 'boss', 'jd', 'filtering', 'greetings'] as const
type MessageRole = (typeof role)[number]

const TOKEN_USAGE_KIND: Partial<Record<MessageRole, TokenUsageKind>> = {
  filtering: 'aiFiltering',
  greetings: 'aiGreeting',
}

function buildOneShotMessages(
  prompt: FormDataAi['prompt'] | string,
  data: WorkflowData<any, any>,
): ModelMessage[] {
  const messages: ModelMessage[] =
    typeof prompt === 'string' ? [{ role: 'user', content: prompt }] : jsonClone(prompt)
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      msg.content = renderTemplate(msg.content, data)
    }
  }
  return messages
}

function usageNumber(
  usage: LanguageModelUsage | undefined,
  key: 'inputTokens' | 'outputTokens' | 'totalTokens',
): number | undefined {
  const value = usage?.[key]
  return typeof value === 'number' ? value : undefined
}

export interface Message extends ChatMessageProps {
  uiRole: MessageRole
  // messages?: ModelMessage[]
}

export class VueChatState<UI_MESSAGE extends UIMessage> implements ChatState<UI_MESSAGE> {
  messagesRef: ShallowRef<UI_MESSAGE[]>
  statusRef = shallowRef<ChatStatus>('ready')
  errorRef = shallowRef<Error | undefined>(undefined)

  constructor(messages?: UI_MESSAGE[]) {
    this.messagesRef = shallowRef(messages ?? [])
  }

  get messages(): UI_MESSAGE[] {
    return this.messagesRef.value
  }

  set messages(messages: UI_MESSAGE[]) {
    this.messagesRef.value = messages
  }

  get status(): ChatStatus {
    return this.statusRef.value
  }

  set status(status: ChatStatus) {
    this.statusRef.value = status
  }

  get error(): Error | undefined {
    return this.errorRef.value
  }

  set error(error: Error | undefined) {
    this.errorRef.value = error
  }

  pushMessage = (message: UI_MESSAGE) => {
    this.messagesRef.value = [...this.messagesRef.value, message]
    triggerRef(this.messagesRef)
  }

  popMessage = () => {
    this.messagesRef.value = this.messagesRef.value.slice(0, -1)
    triggerRef(this.messagesRef)
  }

  replaceMessage = (index: number, message: UI_MESSAGE) => {
    // message is cloned here because vue's deep reactivity shows unexpected behavior, particularly when updating tool invocation parts
    this.messagesRef.value[index] = { ...message }
    triggerRef(this.messagesRef)
  }

  snapshot = <T>(value: T): T => value
}

export class ChatModel {
  states: ShallowReactive<Map<string, VueChatState<Message>>> = shallowReactive(new Map())

  jobs = ref<string[]>([])

  models: Map<string, ReturnType<typeof openai.createModel>> = new Map()
  agents: Map<MessageRole, [ToolLoopAgent, ModelConf, FormDataAi]> = new Map()
  generateId: { [key in MessageRole]: () => string }

  constructor(public ctx: HelperContext<any, any, any>) {
    this.generateId = role.reduce(
      (acc, agentName) => {
        acc[agentName] = createIdGenerator({
          prefix: agentName,
          size: 16,
        })
        return acc
      },
      {} as { [key in MessageRole]: () => string },
    )
  }

  createAgent(
    model: FormDataAi,
    name: MessageRole,
    opt?: {
      json?: boolean
    },
  ): boolean {
    const conf = this.ctx.models.modelData.value.find((m) => m.key === model.model)
    if (!conf || !model.model || !conf.data) {
      return false
    }
    let languageModel = this.models.get(model.model)
    if (!languageModel) {
      languageModel = openai.createModel(conf.data)
      this.models.set(model.model, languageModel)
    }

    const agent = new ToolLoopAgent({
      model: languageModel,
      output: opt?.json ? Output.json() : Output.text(),
      allowSystemInMessages: true,
    })
    this.agents.set(name, [agent, conf, model])
    return true
  }

  async chat(
    agentName: MessageRole,
    data: WorkflowData<any, any>,
    { disableMessages = false }: { disableMessages?: boolean } = {},
  ) {
    const _agent = this.agents.get(agentName)
    if (!_agent) {
      throw new Error(`Agent ${agentName} not found`)
    }

    if (this.jobs.value.findIndex((j) => j === data.jobData.key) === -1 && !disableMessages) {
      this.jobs.value.unshift(data.jobData.key)
    }

    const [agent, modelConf, model] = _agent

    const timeout = modelConf.data?.other?.timeout ?? 60000
    // 故意不复用 session：每次独立请求，只发当次 prompt（system/user），
    // 不带对话历史、不带 previous_response_id，避免 Qwen 等阶梯计费被上下文撑长。
    const messages = buildOneShotMessages(model.prompt, data)
    let state: VueChatState<Message>
    if (!this.states.has(data.jobData.key)) {
      state = new VueChatState<Message>()
      state.pushMessage({
        id: this.generateId[agentName](),
        uiRole: 'jd',
        role: 'system',
        parts: [
          {
            type: 'text',
            text: `## ${data.jobData.jobName ?? data.jobData.positionName} (${data.jobData.activeTime ? new Date(data.jobData.activeTime).toLocaleDateString() : data.jobData.activeTimeStr})
### 薪资: ${data.jobData.salary ?? '面议'}
### 公司: ${data.jobData.brand.name}
### 地址: ${data.jobData.address ?? data.jobData.city}
### 学历: ${data.jobData.degreeName}

${data.jobData.jobDescription}`,
          },
        ],
        avatar: {
          src: data.jobData.brand.logo ?? data.jobData.boss.avatar,
          alt: data.jobData.brand.name ?? data.jobData.boss.name,
        },
      })
      if (!disableMessages) {
        this.states.set(data.jobData.key, state)
      }
    } else {
      state = this.states.get(data.jobData.key)!
      if (!state) {
        throw new Error('消息列表未找到')
      }
    }

    // msgs.pushMessage({
    //   id: this.generateId[agentName](),
    //   side: 'right',
    //   avatar: {
    //     src: this.ctx.userInfo.avatar,
    //     alt: this.ctx.userInfo.name,
    //   },
    //   role: 'user',
    //   uiRole: agentName,
    //   parts: [
    //     {
    //       type: 'text',
    //       text: messages
    //         .map((m) => (typeof m.content === 'string' ? m.content : '[复杂消息]'))
    //         .join('\n'),
    //     },
    //   ],

    //   messages,
    // })

    state.status = 'streaming'

    const msg: Message = {
      id: this.generateId[agentName](),
      role: 'assistant',
      uiRole: agentName,
      parts: [],
      side: 'right',
      avatar: {
        src: modelConf.data?.avatar,
        alt: modelConf.data?.model,
      },
    }
    let index = -1
    let usage: LanguageModelUsage | undefined
    const startedAt = performance.now()
    const stream = await agent.stream({
      timeout,
      messages,
      onStart: (m) => {
        logger.debug('Chat start', m, stream)
      },
      onStepStart: (m) => {
        logger.debug('Chat onStepStart', m)
      },
      onStepEnd: (message) => {
        usage = message.usage
        if (index > 0) {
          state.replaceMessage(index, {
            ...msg,
            parts: message.content as typeof msg.parts,
            metadata: {
              usage: message.usage,
              providerMetadata: message.providerMetadata,
            },
          })
        }
        state.status = 'ready'
      },
      onEnd: (m) => {
        logger.debug('Chat ended', m)
      },
    })

    state.pushMessage(msg)
    index = state.messages.findIndex((m) => m.id === msg.id)

    try {
      for await (const chunk of stream.toUIMessageStream({
        // 仅用于把当前流还原成 UI 消息，不会回传给模型。
        originalMessages: state.messages,
        sendReasoning: true,
        onError: (err) => {
          if (err instanceof Error) {
            if (APICallError.isInstance(err)) {
              return `请求错误 ${err.statusCode}: ${err.message}`
            }
            return err.message
          }
          logger.error('Unknown error during chat streaming', err)
          return `Unknown error: ${err instanceof Error ? err.message : String(err)}`
        },
      })) {
        let part: (typeof msg.parts)[number] | null = null
        const lastPart = msg.parts[msg.parts.length - 1]
        switch (chunk.type) {
          case 'reasoning-delta':
            part = {
              type: 'reasoning',
              text: chunk.delta,
              state: 'streaming',
            }
            break
          case 'reasoning-end':
            if (lastPart && isReasoningUIPart(lastPart)) {
              lastPart.state = 'done'
            }
            break
          case 'text-delta':
            part = {
              type: 'text',
              text: chunk.delta,
              state: 'streaming',
            }
            break
          case 'text-end':
            if (lastPart && isTextUIPart(lastPart)) {
              lastPart.state = 'done'
            }
            break
          case 'error': {
            state.status = 'error'
            state.error = new Error(chunk.errorText)
            break
          }

          case 'abort': {
            logger.error('Chat abort', chunk.reason)
            break
          }
        }
        if (part) {
          msg.parts.push(part)
          state.replaceMessage(index, msg)
        }
        // logger.debug('Received message chunk', chunk)
      }
      state.status = 'ready'
    } catch (e) {
      state.status = 'error'
      state.error = e as Error
      logger.error('Error during chat streaming', e)
    }

    try {
      usage = (await stream.usage) ?? usage
    } catch (error) {
      logger.debug('读取 LLM usage 失败', error)
    }
    // 只记成功调用：token 与耗时写在同一条明细里。
    if (!state.error) {
      this.recordTokenUsage(
        agentName,
        modelConf,
        data,
        usage,
        Math.round(performance.now() - startedAt),
      )
    }

    if (state.error) {
      throw state.error
    }

    // for await (const chunk of readUIMessageStream({ // BUG: 无法正确处理消息
    //   stream: stream.toUIMessageStream({
    //     originalMessages: msgs.messages,
    //     sendReasoning: true,
    //   }),
    //   message: msg,
    // })) {
    //   msgs.replaceMessage(index, chunk)
    // }
    return stream
  }

  private recordTokenUsage(
    agentName: MessageRole,
    modelConf: ModelConf,
    data: WorkflowData<any, any>,
    usage: LanguageModelUsage | undefined,
    durationMs: number,
  ) {
    const kind = TOKEN_USAGE_KIND[agentName]
    if (!kind) return

    const promptTokens = usageNumber(usage, 'inputTokens')
    const completionTokens = usageNumber(usage, 'outputTokens')
    const totalTokens =
      usageNumber(usage, 'totalTokens') ??
      (promptTokens != null || completionTokens != null
        ? (promptTokens ?? 0) + (completionTokens ?? 0)
        : undefined)

    void this.ctx.tokenUsage.record({
      time: Date.now(),
      kind,
      model: modelConf.data?.model ?? modelConf.name,
      modelName: modelConf.name,
      promptTokens,
      completionTokens,
      totalTokens,
      durationMs,
      jobTitle: data.jobData.jobName ?? data.jobData.positionName,
      jobKey: data.jobData.key,
    })
  }
}
