export type BossInt64 = bigint | number | string | { toString(): string }

export interface BossProtoUser {
  uid?: BossInt64
  source?: number | string
  name?: string
  avatar?: string
  company?: string
}

export interface BossProtoJobDesc {
  title?: string
  company?: string
  salary?: string
  url?: string
  jobId?: BossInt64
  positionCategory?: string
  experience?: string
  education?: string
  city?: string
  lid?: string
  content?: string
  labels?: string[]
}

export interface BossProtoMessageBody {
  type?: number | string
  templateId?: number | string
  text?: string
  jobDesc?: BossProtoJobDesc
  securityId?: string
}

export interface BossProtoMessage {
  mid?: BossInt64
  cmid?: BossInt64
  time?: BossInt64
  from?: BossProtoUser
  to?: BossProtoUser
  body?: BossProtoMessageBody
  offline?: boolean
  status?: number | string
  uncount?: number | string
  fromId?: BossInt64
  fromSource?: number | string
  fromName?: string
  fromAvatar?: string
  fromCompany?: string
  toId?: BossInt64
  toSource?: number | string
  toName?: string
  toAvatar?: string
  toCompany?: string
  bodyType?: number | string
  text?: string
  messageType?: string
  jobDesc?: BossProtoJobDesc
  securityId?: string
}

export interface BossChatProtocol {
  type?: number | string
  messages?: BossProtoMessage[]
}

export type BossMessageDirection = 'incoming' | 'outgoing' | 'system'
export type BossMessageContentType = 'text' | 'job' | 'unsupported'

export interface BossMessageJobContext {
  jobName: string
  companyName: string
  salary: string
  description: string
  degree: string
  experience: string
  address: string
  skills: string[]
  lid: string
  encryptJobId: string
  securityId: string
}

export interface BossRealtimeMessage {
  id: string
  conversationId: string
  securityId: string
  participantId: string
  participantSource: number
  participantName: string
  participantAvatar: string
  participantCompany: string
  direction: BossMessageDirection
  contentType: BossMessageContentType
  text: string
  sentAt: number
  rawType: number
  isOffline: boolean
  countsAsUnread: boolean
  jobContext?: BossMessageJobContext
}

function toId(value: BossInt64 | undefined): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.trunc(value)) : ''
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return value.trim()

  const converted = value.toString()
  return converted === '[object Object]' ? '' : converted
}

function toFiniteNumber(value: BossInt64 | undefined): number {
  const parsed = Number(toId(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function toSource(value: number | string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getEncryptJobId(url: string | undefined): string {
  if (!url) return ''
  return url.match(/\/job_detail\/([^/?#.]+)\.html/i)?.[1] || ''
}

export function parseBossChatProtocol(
  protocol: BossChatProtocol,
  currentUserId: BossInt64,
): BossRealtimeMessage[] {
  const ownId = toId(currentUserId)
  if (!ownId || !Array.isArray(protocol.messages)) return []

  return protocol.messages.map((message, index) => {
    const fromId = toId(message.from?.uid ?? message.fromId)
    const toUserId = toId(message.to?.uid ?? message.toId)
    const direction: BossMessageDirection =
      fromId === ownId ? 'outgoing' : toUserId === ownId ? 'incoming' : 'system'
    const participantId =
      direction === 'outgoing' ? toUserId : direction === 'incoming' ? fromId : ''
    const participantSource =
      direction === 'outgoing'
        ? toSource(message.to?.source ?? message.toSource)
        : toSource(message.from?.source ?? message.fromSource)
    const participantName =
      direction === 'outgoing'
        ? message.to?.name || message.toName || ''
        : message.from?.name || message.fromName || ''
    const participantAvatar =
      direction === 'outgoing'
        ? message.to?.avatar || message.toAvatar || ''
        : message.from?.avatar || message.fromAvatar || ''
    const participantCompany =
      direction === 'outgoing'
        ? message.to?.company || message.toCompany || ''
        : message.from?.company || message.fromCompany || ''
    const bodyType = toSource(message.body?.type ?? message.bodyType)
    const text = message.body?.text ?? message.text ?? ''
    const jobDesc = message.body?.jobDesc ?? message.jobDesc
    const securityId = message.body?.securityId || message.securityId || ''
    const jobContext = jobDesc
      ? {
          jobName: jobDesc.title || '',
          companyName: jobDesc.company || '',
          salary: jobDesc.salary || '',
          description: jobDesc.content || '',
          degree: jobDesc.education || '',
          experience: jobDesc.experience || '',
          address: jobDesc.city || '',
          skills: Array.isArray(jobDesc.labels) ? jobDesc.labels.filter(Boolean) : [],
          lid: jobDesc.lid || '',
          encryptJobId: getEncryptJobId(jobDesc.url),
          securityId,
        }
      : undefined
    const contentType: BossMessageContentType =
      Boolean(typeof text === 'string' && text.trim()) &&
      (bodyType === 1 || !bodyType || message.messageType === 'text')
        ? 'text'
        : jobContext
          ? 'job'
          : 'unsupported'
    const sentAt = toFiniteNumber(message.time)
    // 与 BOSS Chat SDK 的未读计数规则保持一致，避免把系统消息和已读消息重复计数。
    const countsAsUnread =
      direction === 'incoming' &&
      Number(message.uncount ?? 0) === 0 &&
      Number(message.status ?? 0) !== 2 &&
      Boolean(typeof text === 'string' && text.trim())
    const id =
      toId(message.mid) ||
      toId(message.cmid) ||
      `fallback:${fromId}:${toUserId}:${sentAt}:${bodyType}:${index}`

    return {
      id,
      conversationId: `${participantId || 'unknown'}-${participantSource}`,
      securityId,
      participantId,
      participantSource,
      participantName,
      participantAvatar,
      participantCompany,
      direction,
      contentType,
      text: contentType === 'text' ? text : '',
      sentAt,
      rawType: bodyType,
      isOffline: Boolean(message.offline),
      countsAsUnread,
      jobContext,
    }
  })
}
