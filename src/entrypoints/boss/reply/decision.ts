import type { BossReplyAction, BossReplyDecision } from '@/types/aiReply'

const ACTIONS = new Set<BossReplyAction>(['reply', 'ignore', 'need_human'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(value: string): unknown {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced?.[1] ?? trimmed)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeReplyForSafetyCheck(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, '')
}

function hasInternalEvidenceMarker(
  reply: string,
  allowedEvidenceIds: ReadonlySet<string>,
): boolean {
  const normalizedReply = normalizeReplyForSafetyCheck(reply)
  const exactTokens = new Set([...allowedEvidenceIds].map(normalizeReplyForSafetyCheck))
  for (const id of allowedEvidenceIds) {
    const normalizedId = normalizeReplyForSafetyCheck(id)
    if (normalizedId.startsWith('knowledge:')) {
      exactTokens.add(normalizedId.slice('knowledge:'.length))
    }
  }

  for (const token of exactTokens) {
    if (!token) continue
    const escapedToken = escapeRegExp(token)
    if (
      new RegExp(`(?:\\[\\s*${escapedToken}\\s*\\]|【\\s*${escapedToken}\\s*】)`, 'iu').test(
        normalizedReply,
      )
    ) {
      return true
    }
  }

  // 兜底拦截裸露或组合引用；技术名词如 Java、Vue 3 不匹配这些内部命名规则。
  return /(?:\[\s*job\s*\]|【\s*job\s*】|(?:knowledge|message)\s*:|\bevidenceIds?\b|可用\s*证据\s*ID|\bK\d{2,}\b|\[[^\]\r\n]*(?:(?:knowledge|message):[^\]\r\n]+|\bK\d{2,}\b)[^\]\r\n]*\]|【[^】\r\n]*(?:(?:knowledge|message):[^】\r\n]+|\bK\d{2,}\b)[^】\r\n]*】)/iu.test(
    normalizedReply,
  )
}

export function validateBossReplyDecision(
  value: string | unknown,
  allowedEvidenceIds: ReadonlySet<string>,
  maxReplyLength: number,
): BossReplyDecision {
  const parsed = typeof value === 'string' ? parseJson(value) : value
  if (!isRecord(parsed) || !ACTIONS.has(parsed.action as BossReplyAction)) {
    throw new Error('AI 返回了无效或不支持的处理动作')
  }

  const action = parsed.action as BossReplyAction
  const intent = typeof parsed.intent === 'string' ? parsed.intent.trim() : ''
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : ''
  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : ''
  const evidenceIds = Array.isArray(parsed.evidenceIds)
    ? [
        ...new Set(
          parsed.evidenceIds.filter((item): item is string => typeof item === 'string'),
        ),
      ].slice(0, 20)
    : []

  if (!intent) throw new Error('AI 未返回意图标识')
  if (!reason) throw new Error('AI 未说明处理原因')
  if (evidenceIds.some((id) => !allowedEvidenceIds.has(id))) {
    throw new Error('AI 引用了不存在或未经确认的知识证据')
  }

  if (action === 'reply') {
    if (!reply) throw new Error('AI 选择回复，但没有返回回复内容')
    if (hasInternalEvidenceMarker(reply, allowedEvidenceIds)) {
      throw new Error('AI 回复正文包含内部证据标记，已转人工处理')
    }
    if (reply.length > maxReplyLength) {
      throw new Error(`AI 回复超过 ${maxReplyLength} 字限制`)
    }
    if (evidenceIds.length === 0) {
      throw new Error('AI 回复缺少可验证证据')
    }
  }

  return {
    action,
    intent: intent.slice(0, 80),
    reason: reason.slice(0, 500),
    reply: action === 'reply' ? reply : '',
    evidenceIds,
  }
}
