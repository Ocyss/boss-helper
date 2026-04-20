export const BOSS_HELPER_CHAT_BRIDGE_SOURCE = '__boss_helper_chat__'
export const BOSS_HELPER_CHAT_BRIDGE_SEND = 'boss_helper_chat_send'
export const BOSS_HELPER_CHAT_BRIDGE_RESULT = 'boss_helper_chat_result'

export interface BossHelperChatMessageArgs {
  form_uid: string
  to_uid: string
  to_name: string
  friend_source?: number
  content?: string
  image?: string
}

export interface BossHelperChatSendRequest {
  source: typeof BOSS_HELPER_CHAT_BRIDGE_SOURCE
  type: typeof BOSS_HELPER_CHAT_BRIDGE_SEND
  requestId: string
  payload: BossHelperChatMessageArgs
}

export interface BossHelperChatSendResult {
  source: typeof BOSS_HELPER_CHAT_BRIDGE_SOURCE
  type: typeof BOSS_HELPER_CHAT_BRIDGE_RESULT
  requestId: string
  success: boolean
  error?: string
}

export function isBossHelperChatSendRequest(
  value: unknown,
): value is BossHelperChatSendRequest {
  return (
    typeof value === 'object' &&
    value != null &&
    'source' in value &&
    'type' in value &&
    'requestId' in value &&
    (value as BossHelperChatSendRequest).source === BOSS_HELPER_CHAT_BRIDGE_SOURCE &&
    (value as BossHelperChatSendRequest).type === BOSS_HELPER_CHAT_BRIDGE_SEND
  )
}

export function isBossHelperChatSendResult(
  value: unknown,
): value is BossHelperChatSendResult {
  return (
    typeof value === 'object' &&
    value != null &&
    'source' in value &&
    'type' in value &&
    'requestId' in value &&
    (value as BossHelperChatSendResult).source === BOSS_HELPER_CHAT_BRIDGE_SOURCE &&
    (value as BossHelperChatSendResult).type === BOSS_HELPER_CHAT_BRIDGE_RESULT
  )
}
