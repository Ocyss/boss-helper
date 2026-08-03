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
} from 'ai'
import { ShallowReactive } from 'vue'

import { FormDataAi } from '@/types/formData'
import { renderTemplate } from '@/utils/ai'

import { ModelConf } from '.'
import { WorkflowData } from '../useApplying/type'
import { HelperContext } from '../useHelper'
import { openai } from './openai'

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
    if (!conf.data) return false

    const advanced = conf.data.advanced ?? {}
    const agent = new ToolLoopAgent({
      model: openai.createModel(conf.data),
      output: opt?.json ? Output.json() : Output.text(),
      allowSystemInMessages: true,
      temperature: advanced.temperature,
      topP: advanced.top_p,
      presencePenalty: advanced.presence_penalty,
      frequencyPenalty: advanced.frequency_penalty,
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

    const idleTimeout = modelConf.data?.other?.timeout ?? 60000
    const abortController = new AbortController()
    let messages: ModelMessage[]

    if (typeof model.prompt === 'string') {
      messages = [{ role: 'user', content: model.prompt }]
    } else {
      messages = jsonClone(model.prompt)
    }
    for (const i in messages) {
      if (typeof messages[i].content === 'string') {
        messages[i].content = renderTemplate(messages[i].content, data)
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
      abortSignal: abortController.signal,
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

    // Idle timeout: reset on every chunk, only fires when no data flows for idleTimeout ms
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        state.status = 'error'
        state.error = new Error(`AI 响应超时 (${idleTimeout / 1000}s 无数据)`)
        abortController.abort()
      }, idleTimeout)
    }
    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
    }
    resetIdleTimer()

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
          return `Unknown error: ${err}`
        },
      })) {
        resetIdleTimer()
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
            if (isReasoningUIPart(lastPart)) {
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
            if (isTextUIPart(lastPart)) {
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
    } finally {
      clearIdleTimer()
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
