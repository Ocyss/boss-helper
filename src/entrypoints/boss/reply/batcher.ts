import type { BossRealtimeMessage } from '../chat/message-parser'

const DEFAULT_BATCH_DELAY_MS = 2500

interface PendingBatch {
  messages: BossRealtimeMessage[]
  timer: ReturnType<typeof setTimeout>
}

export class BossReplyBatcher {
  private readonly batches = new Map<string, PendingBatch>()

  constructor(
    private readonly onFlush: (messages: BossRealtimeMessage[]) => void | Promise<void>,
    private readonly delayMs = DEFAULT_BATCH_DELAY_MS,
  ) {}

  enqueue(message: BossRealtimeMessage): void {
    const current = this.batches.get(message.conversationId)
    if (current) {
      clearTimeout(current.timer)
      current.messages.push(message)
      current.timer = this.createTimer(message.conversationId)
      return
    }

    this.batches.set(message.conversationId, {
      messages: [message],
      timer: this.createTimer(message.conversationId),
    })
  }

  clearSession(conversationId: string): void {
    const batch = this.batches.get(conversationId)
    if (batch) clearTimeout(batch.timer)
    this.batches.delete(conversationId)
  }

  clear(): void {
    for (const batch of this.batches.values()) clearTimeout(batch.timer)
    this.batches.clear()
  }

  private createTimer(conversationId: string): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      const batch = this.batches.get(conversationId)
      if (!batch) return
      this.batches.delete(conversationId)
      void this.onFlush(batch.messages)
    }, this.delayMs)
  }
}
