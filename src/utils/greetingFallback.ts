interface GreetingArgs {
  form_uid?: string
  to_uid?: string
  to_name?: string
  boss_name?: string
  job_name?: string
  content?: string
}

interface PendingGreeting extends GreetingArgs {
  id: string
  identity: string
  status: 'pending' | 'sent' | 'failed'
  source: string
  reason: string
  createdAt: number
}

declare global {
  interface Window {
    __bossHelperQueueGreeting?: (args: GreetingArgs, reason: string) => boolean
    __bossHelperAiRuntime?: (detail: Record<string, unknown>) => void
    __bossHelperDefaultGreetingAfter?: () => {
      after: (_row: unknown, context: Record<string, any>) => Promise<void>
    }
  }
}

const QUEUE_KEY = 'boss_helper_pending_greetings_v1'
const AI_RUNTIME_KEY = 'boss_helper_ai_runtime_v1'
const CUSTOM_GREETING_CACHE_KEY = 'boss_helper_custom_greeting_cache_v1'

function readQueue(): PendingGreeting[] {
  try {
    const items = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    return Array.isArray(items) ? items : []
  } catch (err) {
    console.warn('[BossHelper] greeting fallback queue parse failed', err)
    return []
  }
}

function writeQueue(items: PendingGreeting[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-200)))
}

function readConfiguredGreeting() {
  try {
    const cache = JSON.parse(localStorage.getItem(CUSTOM_GREETING_CACHE_KEY) || '{}')
    const greeting = String(cache?.value || '').trim()
    return cache?.enable && greeting ? greeting : ''
  } catch (err) {
    console.warn('[BossHelper] custom greeting cache parse failed', err)
    return ''
  }
}

function enqueueGreeting(args: GreetingArgs, reason: string) {
  const content = String(args?.content || '').trim()
  if (!content) return false

  const queue = readQueue()
  const identity = [args?.to_uid, args?.to_name, args?.boss_name, content].join('|')
  const exists = queue.some((item) => item.status === 'pending' && item.identity === identity)
  if (exists) return true

  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    identity,
    status: 'pending',
    source: 'main-world-fallback',
    reason,
    createdAt: Date.now(),
    form_uid: args?.form_uid || '',
    to_uid: args?.to_uid || '',
    to_name: args?.to_name || '',
    boss_name: args?.boss_name || '',
    job_name: args?.job_name || '',
    content,
  })
  writeQueue(queue)
  window.dispatchEvent(
    new CustomEvent('boss-helper:greeting-queued', {
      detail: { pending: queue.filter((item) => item.status !== 'sent' && item.status !== 'failed').length },
    }),
  )
  console.warn('[BossHelper] chat channel unavailable; queued greeting for chat page fallback')
  return true
}

function recordAiRuntime(detail: Record<string, unknown>) {
  const payload = {
    ...detail,
    updatedAt: Date.now(),
  }
  localStorage.setItem(AI_RUNTIME_KEY, JSON.stringify(payload))
  window.dispatchEvent(new CustomEvent('boss-helper:ai-runtime', { detail: payload }))
}

function defaultGreetingAfter() {
  return {
    after: async (_row: unknown, context: Record<string, any>) => {
      if (String(context?.message || '').trim()) return

      const card = context?.listData?.card || context?.data?.card || {}
      const boss = context?.bossData?.data || {}
      const content = readConfiguredGreeting()

      if (!content) {
        recordAiRuntime({
          stage: 'no-greeting-content',
          reason: 'ai greeting did not produce content and custom greeting is not enabled',
          to_uid: boss.bossId || card.encryptUserId || card.encryptBossId || '',
          boss_name: boss.name || card.bossName || card.bossInfo?.name || '',
          job_name: card.jobName || card.jobInfo?.jobName || '',
        })
        return
      }

      enqueueGreeting(
        {
          form_uid: '',
          to_uid: boss.bossId || card.encryptUserId || card.encryptBossId || '',
          to_name: boss.encryptBossId || card.encryptUserId || card.bossName || '',
          boss_name: boss.name || card.bossName || card.bossInfo?.name || '',
          job_name: card.jobName || card.jobInfo?.jobName || '',
          content,
        },
        'configured custom greeting queued after successful delivery',
      )

      context.message = content
    },
  }
}

export function installGreetingFallback() {
  window.__bossHelperQueueGreeting = enqueueGreeting
  window.__bossHelperAiRuntime = recordAiRuntime
  window.__bossHelperDefaultGreetingAfter = defaultGreetingAfter
}
