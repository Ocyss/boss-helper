import { createOpenAI, OpenAIProvider } from '@ai-sdk/openai'
import { ChatMessageProps } from '@nuxt/ui'
import {
  APICallError,
  ChatState,
  ChatStatus,
  ModelMessage,
  Output,
  ToolLoopAgent,
  UIMessage,
  createIdGenerator,
  isReasoningUIPart,
  isTextUIPart,
  streamText,
} from 'ai'
import { ShallowReactive } from 'vue'

import { FormDataAi } from '@/types/formData'
import { renderTemplate } from '@/utils/ai'

import { ModelConf } from '.'
import { WorkflowData } from '../useApplying/type'
import { HelperContext } from '../useHelper'

const role = ['system', 'user', 'assistant', 'boss', 'jd', 'filtering', 'greetings'] as const
type MessageRole = (typeof role)[number]

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

  providers: Map<string, OpenAIProvider> = new Map()
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
    if (!conf || !model.model) {
      return false
    }
    let provider = this.providers.get(model.model)
    if (!provider) {
      provider = createOpenAI({
        baseURL: conf.data?.base_url,
        apiKey: conf.data?.api_key,
        headers: conf.data?.advanced?.extra_headers,
      })
    }
    this.providers.set(model.model, provider)

    const agent = new ToolLoopAgent({
      model: conf.data?.responses
        ? provider.responses(conf.data?.model || 'gpt-4o')
        : provider.chat(conf.data?.model || 'gpt-4o'),
      output: opt?.json ? Output.json() : Output.text(),
      allowSystemInMessages: true,
    })
    this.agents.set(name, [agent, conf, model])
    return true
  }

  async testConnection(modelKey: string) {
    const conf = this.ctx.models.modelData.value.find((model) => model.key === modelKey)
    if (!conf?.data) {
      throw new Error('模型配置不存在')
    }

    const provider = createOpenAI({
      baseURL: conf.data.base_url,
      apiKey: conf.data.api_key,
      headers: conf.data.advanced?.extra_headers,
    })
    const model = conf.data.responses
      ? provider.responses(conf.data.model)
      : provider.chat(conf.data.model)
    const result = streamText({
      model,
      prompt: 'Reply with OK only.',
      maxOutputTokens: 8,
      abortSignal: AbortSignal.timeout(
        Math.max(1000, Math.min(conf.data.other?.timeout ?? 15000, 15000)),
      ),
    })
    const text = await result.text
    if (!text.trim()) {
      throw new Error('模型返回内容为空')
    }
    return text.trim()
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
    let messages: ModelMessage[]

    if (typeof model.prompt === 'string') {
      messages = [{ role: 'user', content: model.prompt }]
    } else {
      messages = jsonClone(model.prompt)
    }
    for (const message of messages) {
      if (typeof message.content === 'string') {
        message.content = renderTemplate(message.content, data)
      }
    }
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
          return `Unknown error: ${String(err)}`
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
}
