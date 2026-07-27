import type { ChatNotification, IncomingChatMessage } from './types'

export function getBossChatUrl(senderId: string, senderSource?: string) {
  const id = senderId.trim()
  if (!id) return null

  const url = new URL('https://www.zhipin.com/web/geek/chat')
  url.searchParams.set('id', id)
  url.searchParams.set('source', senderSource?.trim() || '0')
  return url.toString()
}

export function getBossChatUrlForMessage(
  message: Pick<IncomingChatMessage, 'senderId' | 'senderSource'>,
) {
  return getBossChatUrl(message.senderId, message.senderSource)
}

export function getBossChatUrlForNotification(notification: ChatNotification) {
  if (notification.senderId) {
    return getBossChatUrl(notification.senderId, notification.senderSource)
  }

  const [senderId, senderSource] = notification.conversationId.split(':')
  return getBossChatUrl(senderId ?? '', senderSource)
}
