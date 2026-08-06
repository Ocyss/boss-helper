import { defineProxy } from 'comctx'

import { browser, defineBackground } from '#imports'
import type { CandidateProfile } from '@/composables/useApplying/utils'
import { resolveModelTimeout } from '@/composables/useModel/common'
import { BackgroundCounter, ProvideBackgroundAdapter } from '@/message/background'
import type { ReplyDraftItem } from '@/types/replyDraft'
import { replyDraftQueueKey } from '@/types/replyDraft'
import { BOSS_HELPER_V2_BACKGROUND_NAMESPACE } from '@/utils/namespace'

const notificationTargets = new Map<string, string>()
const modelStorageKey = 'boss-helper-v2:models'
const profileStorageKey = 'boss-helper-v2:candidate-profile'

interface DraftGenerationRequest {
  type: 'BHV2_GENERATE_REPLY_DRAFT'
  conversationId: string
  messageId: string
}

interface DraftGenerationResponse {
  ok: boolean
  draft?: string
  error?: string
}

/** 生成 OpenAI-compatible chat completions 地址，不记录或返回 API 凭据。 */
function chatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/u, '')
  if (/\/chat\/completions$/iu.test(normalized)) return normalized
  if (/\/v1$/iu.test(normalized)) return `${normalized}/chat/completions`
  return `${normalized}/v1/chat/completions`
}

/** 检查画像是否包含足以支持事实回复的内容；为空时不调用模型。 */
function profileHasFacts(profile: CandidateProfile | null): boolean {
  if (!profile) return false
  return Boolean(
    profile.resume_summary.trim() ||
    profile.target_roles.length > 0 ||
    profile.skills_with_evidence.some((item) => item.skill.trim() && item.evidence.trim()),
  )
}

/** 校验模型草稿长度、句数和人工判断标记，任何异常均 fail-closed。 */
function validateDraft(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text === '需人工判断' || text.length > 150) return null
  const sentenceCount = text.split(/[。！？!?]+/u).filter(Boolean).length
  return sentenceCount <= 3 ? text : null
}

/** 从模型响应中提取纯文本，支持 OpenAI-compatible 常见 content 结构。 */
function extractDraft(payload: any): string | null {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return validateDraft(content)
  if (Array.isArray(content)) {
    return validateDraft(
      content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join(''),
    )
  }
  return null
}

/** 在 background/service worker 中生成草稿并回写本地队列，不执行填入或发送。 */
async function generateReplyDraft(
  request: DraftGenerationRequest,
): Promise<DraftGenerationResponse> {
  const stored = await browser.storage.local.get([
    replyDraftQueueKey,
    modelStorageKey,
    profileStorageKey,
  ])
  const queue = Array.isArray(stored[replyDraftQueueKey])
    ? (stored[replyDraftQueueKey] as ReplyDraftItem[])
    : []
  const index = queue.findIndex(
    (item) =>
      item.conversationId === request.conversationId && item.messageId === request.messageId,
  )
  if (index < 0) return { ok: false, error: '草稿队列中没有对应会话' }

  const profile = stored[profileStorageKey] as CandidateProfile | null
  if (!profileHasFacts(profile)) return { ok: false, error: '候选人画像为空，已停止 AI 草稿' }

  const models = Array.isArray(stored[modelStorageKey]) ? stored[modelStorageKey] : []
  const modelConf = models.find((item: any) => item?.data?.api_key && item?.data?.base_url)
  const data = modelConf?.data
  if (!data?.api_key || !data?.base_url || !data?.model) {
    return { ok: false, error: '未配置可用的 OpenAI-compatible 模型' }
  }

  const item = queue[index]
  const prompt = [
    {
      role: 'system',
      content:
        '你是 BOSS 直聘求职者的回复草稿助手。只使用候选人事实画像中明确出现的信息，不得编造；输出纯文本，最多150字、最多3句话。信息不足时只输出“需人工判断”。不执行发送。\n候选人事实画像：\n' +
        JSON.stringify(profile),
    },
    {
      role: 'user',
      content: `招聘者最新来信：\n${item.text}`,
    },
  ]

  try {
    const response = await fetch(chatCompletionsUrl(String(data.base_url)), {
      method: 'POST',
      headers: {
        ...(data.advanced?.extra_headers ?? {}),
        'Content-Type': 'application/json',
        Authorization: `Bearer ${String(data.api_key)}`,
      },
      body: JSON.stringify({
        model: String(data.model),
        messages: prompt,
        temperature: 0.2,
        stream: false,
      }),
      signal: AbortSignal.timeout(resolveModelTimeout(data.other?.timeout)),
    })
    if (!response.ok) return { ok: false, error: `模型请求失败（HTTP ${response.status}）` }
    const payload = await response.json()
    const draft = extractDraft(payload)
    if (!draft) return { ok: false, error: '模型输出不符合招呼语约束，已停止草稿' }

    queue[index] = {
      ...item,
      draft,
      status: 'ready',
      error: undefined,
      updatedAt: new Date().toISOString(),
    }
    await browser.storage.local.set({ [replyDraftQueueKey]: queue.slice(-100) })
    return { ok: true, draft }
  } catch (error) {
    // 错误只返回通用分类，不回传 URL、请求体、密钥或完整模型响应。
    const message =
      error instanceof DOMException && error.name === 'TimeoutError'
        ? '模型请求超时'
        : '模型请求失败'
    queue[index] = { ...item, status: 'error', error: message, updatedAt: new Date().toISOString() }
    await browser.storage.local.set({ [replyDraftQueueKey]: queue.slice(-100) })
    return { ok: false, error: message }
  }
}

export default defineBackground({
  main() {
    const [provideBackgroundCounter] = defineProxy(() => new BackgroundCounter(), {
      namespace: BOSS_HELPER_V2_BACKGROUND_NAMESPACE,
    })

    provideBackgroundCounter(new ProvideBackgroundAdapter())

    // 回复监控只负责通知和打开会话；不使用 chrome.cookies、不填入输入框、不点击发送。
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        (message as { type?: unknown }).type === 'BHV2_GENERATE_REPLY_DRAFT'
      ) {
        return generateReplyDraft(message as DraftGenerationRequest)
      }
      if (
        !message ||
        typeof message !== 'object' ||
        (message as { type?: unknown }).type !== 'BHV2_NOTIFY_UNREAD'
      ) {
        return undefined
      }
      const payload = message as { conversationId?: string; messageId?: string }
      if (!payload.conversationId || !payload.messageId) return undefined
      const notificationId = `boss-helper-v2:${payload.conversationId}:${payload.messageId}`
      notificationTargets.set(notificationId, payload.conversationId)
      return browser.notifications
        .create(notificationId, {
          type: 'basic',
          iconUrl: '/icons/128.png',
          title: 'Boss Helper V2：新招聘消息',
          message: '检测到未读消息，点击打开会话并人工确认。',
        })
        .then(() => undefined)
    })
    browser.notifications.onClicked.addListener((notificationId) => {
      const conversationId = notificationTargets.get(notificationId)
      if (!conversationId) return
      void browser.tabs.create({
        url: `https://www.zhipin.com/web/geek/chat?conversationId=${encodeURIComponent(conversationId)}`,
      })
      notificationTargets.delete(notificationId)
    })
  },
})
