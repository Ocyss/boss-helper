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
} from 'ai'
import { ShallowReactive } from 'vue'

import { getCandidateProfile } from '@/composables/useApplying/utils'
import { FormDataAi } from '@/types/formData'
import { renderTemplate } from '@/utils/ai'

import { ModelConf } from '.'
import { WorkflowData } from '../useApplying/type'
import { HelperContext } from '../useHelper'
import type { DiagnosticDetails } from '../useHelper/type'
import { resolveModelTimeout } from './common'

const role = ['system', 'user', 'assistant', 'boss', 'jd', 'filtering', 'greetings'] as const
type MessageRole = (typeof role)[number]

export interface Message extends ChatMessageProps {
  uiRole: MessageRole
  // messages?: ModelMessage[]
}

type ModelErrorSummary = {
  kind: 'timeout' | 'http_error' | 'request_error'
  message: string
  httpStatus?: number
}

/** 将模型错误压缩为不含 URL、请求体、密钥或完整响应的可展示摘要。 */
function summarizeModelError(error: unknown, timeoutMs: number): ModelErrorSummary {
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      ['TimeoutError', 'AbortError'].includes(error.name)) ||
    /signal\s+timed\s*out|timed\s*out|timeout|超时|abort/iu.test(rawMessage)
  ) {
    return {
      kind: 'timeout',
      message: `模型请求超时（${Math.round(timeoutMs / 1000)}秒）`,
    }
  }
  if (APICallError.isInstance(error)) {
    return {
      kind: 'http_error',
      message: `模型接口错误（HTTP ${error.statusCode ?? '未知'}）`,
      httpStatus: error.statusCode,
    }
  }
  return {
    kind: 'request_error',
    message: `模型请求失败（${error instanceof Error && error.name ? error.name : '未知错误'}）`,
  }
}

/** 返回经过分类的 Error，避免任务日志再次写入原始异常对象。 */
function normalizeModelError(error: unknown, timeoutMs: number): Error {
  return new Error(summarizeModelError(error, timeoutMs).message)
}

/** 将模型错误摘要转换为诊断白名单字段，避免把异常对象传入日志。 */
function diagnosticErrorDetails(summary: ModelErrorSummary): DiagnosticDetails {
  return {
    errorKind: summary.kind,
    errorMessage: summary.message,
    httpStatus: summary.httpStatus,
  }
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
      })
    }
    this.providers.set(model.model, provider)

    const agent = new ToolLoopAgent({
      model: provider.chat(conf.data?.model || 'gpt-4o'),
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

    const timeout = resolveModelTimeout(modelConf.data?.other?.timeout)
    const startedAt = Date.now()
    const diagnosticTitle = `${data.jobData.jobName} · AI${agentName}`
    const recordDiagnostic = (details: DiagnosticDetails) => {
      this.ctx.logs.diagnostic(diagnosticTitle, {
        agent: agentName,
        timeoutMs: timeout,
        elapsedMs: Date.now() - startedAt,
        ...details,
      })
    }
    recordDiagnostic({ event: 'request_start', phase: 'model_stream' })
    let messages: ModelMessage[]

    if (typeof model.prompt === 'string') {
      messages = [{ role: 'user', content: model.prompt }]
    } else {
      messages = jsonClone(model.prompt)
    }
    // 画像由本机扩展存储读取，仅注入本次 Prompt，不进入日志或任务结果。
    const candidateProfile = await getCandidateProfile()
    // 画像以结构化 JSON 注入模型上下文；不写入扩展日志或任务结果。
    const templateData = {
      ...data,
      candidateProfile: JSON.stringify(candidateProfile, null, 2),
    }
    for (const i in messages) {
      if (typeof messages[i].content === 'string') {
        messages[i].content = renderTemplate(messages[i].content, templateData)
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
    state.error = undefined

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
    let stream: Awaited<ReturnType<typeof agent.stream>>
    try {
      stream = await agent.stream({
        timeout,
        messages,
        onStart: () => {
          logger.debug('Chat start', { jobKey: data.jobData.key, agent: agentName })
          recordDiagnostic({ event: 'provider_start', phase: 'model_stream' })
        },
        onStepStart: () => {
          logger.debug('Chat step start', { jobKey: data.jobData.key, agent: agentName })
          recordDiagnostic({ event: 'step_start', phase: 'model_stream' })
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
          recordDiagnostic({ event: 'step_end', phase: 'model_stream' })
        },
        onEnd: () => {
          logger.debug('Chat ended', { jobKey: data.jobData.key, agent: agentName })
          recordDiagnostic({ event: 'provider_end', phase: 'model_stream' })
        },
      })
    } catch (error) {
      const summary = summarizeModelError(error, timeout)
      state.status = 'error'
      state.error = new Error(summary.message)
      recordDiagnostic({
        event: 'request_error',
        phase: 'agent_stream',
        ...diagnosticErrorDetails(summary),
      })
      throw state.error
    }

    state.pushMessage(msg)
    index = state.messages.findIndex((m) => m.id === msg.id)

    try {
      for await (const chunk of stream.toUIMessageStream({
        originalMessages: state.messages,
        sendReasoning: true,
        onError: (err) => {
          const summary = summarizeModelError(err, timeout)
          recordDiagnostic({
            event: 'stream_error',
            phase: 'ui_stream',
            ...diagnosticErrorDetails(summary),
          })
          return summary.message
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
            state.error = normalizeModelError(chunk.errorText, timeout)
            recordDiagnostic({
              event: 'chunk_error',
              phase: 'ui_stream',
              errorKind: 'request_error',
              errorMessage: state.error.message,
            })
            break
          }

          case 'abort': {
            state.status = 'error'
            state.error = normalizeModelError(chunk.reason || 'signal timed out', timeout)
            recordDiagnostic({
              event: 'stream_abort',
              phase: 'ui_stream',
              errorKind: 'timeout',
              errorMessage: state.error.message,
            })
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
      state.error = normalizeModelError(e, timeout)
      const summary = summarizeModelError(e, timeout)
      recordDiagnostic({
        event: 'request_error',
        phase: 'ui_stream',
        ...diagnosticErrorDetails(summary),
      })
    }

    if (state.error) {
      throw state.error
    }

    recordDiagnostic({ event: 'request_success', phase: 'model_stream' })

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
