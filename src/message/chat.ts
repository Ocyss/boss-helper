export const CHAT_SEND_MESSAGE = '__boss_helper_chat_send__'
export const CHAT_SEND_RESULT = '__boss_helper_chat_send_result__'

export interface ChatSendArgs {
  form_uid: string
  to_uid: string
  to_name: string
  content?: string
  image?: string
}

export interface ChatSendRuntimeMessage {
  type: typeof CHAT_SEND_MESSAGE
  requestId: string
  payload: ChatSendArgs
}

export interface ChatSendRuntimeResult {
  type: typeof CHAT_SEND_RESULT
  requestId: string
  ok: boolean
  error?: string
}
