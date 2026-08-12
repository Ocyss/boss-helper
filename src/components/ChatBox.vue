<script lang="ts" setup>
import type { SlideoverProps } from '@nuxt/ui/components/Slideover.vue'
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'
import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart } from 'ai'
import type { UIMessage } from 'ai'

import { appearanceConf } from '@/composables/conf'
import { parseFiltering } from '@/composables/useApplying/utils'
import { useHelper } from '@/composables/useHelper'
import type { Message } from '@/composables/useModel'

type BossSessionReadFilter = 'all' | 'unread' | 'read'
type ChatBoxSlideoverContent = NonNullable<SlideoverProps['content']> & {
  style: {
    width: string
    maxWidth: string
  }
}

const MIN_CHAT_BOX_WIDTH = 900
const open = defineModel('open', { default: false })
const following = ref(true)
const chatMessages = useTemplateRef('chatMessages') // TODO: auto scroll
const sessionSearch = ref('')
const sessionReadFilter = ref<BossSessionReadFilter>('all')

const helper = useHelper()
const isBossHelper = computed(() => helper.key === 'boss')
// ChatModel.jobs 同时承载岗位 AI 处理记录；BOSS 会话面板只允许展示已登记会话。
const visibleSessionKeys = computed(() =>
  isBossHelper.value
    ? helper.chatModel.jobs.value.filter(
        (key) => helper.chatModel.sessions.get(key)?.kind === 'boss',
      )
    : helper.chatModel.jobs.value,
)
const selectJob = ref<string | null>(null)

const sessions = computed(() =>
  visibleSessionKeys.value.map((key) => {
    const state = helper.chatModel.states.get(key)
    const lastMessage = state?.messages.at(-1)
    const lastText = (lastMessage?.parts ?? [])
      .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim()
    const loadedMessageText = (state?.messages ?? [])
      .slice(-24)
      .flatMap((message) =>
        (message.parts ?? []).map((part) =>
          'text' in part && typeof part.text === 'string' ? part.text : '',
        ),
      )
      .filter(Boolean)
      .join('\n')
    const meta = helper.chatModel.sessions.get(key)

    return {
      key,
      job: helper.jobMaps.get(key),
      meta,
      lastText,
      lastDirection: lastMessage?.bossDirection,
      reply: helper.chatModel.bossReplySessions.get(key),
      unreadCount: meta?.unreadCount || 0,
      unreadState: meta?.unreadState || 'unknown',
      searchText: [
        meta?.title,
        meta?.subtitle,
        meta?.companyName,
        meta?.jobName,
        lastText,
        loadedMessageText,
      ]
        .filter(Boolean)
        .join('\n')
        .toLocaleLowerCase('zh-CN'),
    }
  }),
)

const unreadSessionCount = computed(
  () => sessions.value.filter((session) => session.unreadCount > 0).length,
)
const readSessionCount = computed(
  () => sessions.value.filter((session) => session.unreadState === 'read').length,
)
const sessionFilterItems = computed<
  Array<{ value: BossSessionReadFilter; label: string; count: number; title: string }>
>(() => [
  {
    value: 'all',
    label: '全部',
    count: sessions.value.length,
    title: '显示全部会话',
  },
  {
    value: 'unread',
    label: '未读',
    count: unreadSessionCount.value,
    title: '显示收到新消息但尚未打开的会话',
  },
  {
    value: 'read',
    label: '已读',
    count: readSessionCount.value,
    title: '仅显示已确认读过的会话；尚未同步状态的会话保留在“全部”中',
  },
])
const filteredSessions = computed(() => {
  const keyword = sessionSearch.value.trim().toLocaleLowerCase('zh-CN')
  return sessions.value.filter((session) => {
    const matchesReadState =
      sessionReadFilter.value === 'all' ||
      (sessionReadFilter.value === 'unread' && session.unreadCount > 0) ||
      (sessionReadFilter.value === 'read' && session.unreadState === 'read')
    return matchesReadState && (!keyword || session.searchText.includes(keyword))
  })
})
const hasSessionFilter = computed(
  () => sessionReadFilter.value !== 'all' || Boolean(sessionSearch.value.trim()),
)
const sessionCountLabel = computed(() =>
  filteredSessions.value.length === sessions.value.length
    ? String(sessions.value.length)
    : `${filteredSessions.value.length}/${sessions.value.length}`,
)
const effectiveChatBoxWidth = computed(() =>
  Math.max(Number(appearanceConf.value.chatBoxWidth) || 0, MIN_CHAT_BOX_WIDTH),
)
const slideoverContentProps = computed<ChatBoxSlideoverContent>(() => ({
  style: {
    width: `${effectiveChatBoxWidth.value}px`,
    maxWidth: '96vw',
  },
}))

function clearSessionFilter(): void {
  sessionSearch.value = ''
  sessionReadFilter.value = 'all'
}

const selectedSession = computed(() =>
  selectJob.value ? helper.chatModel.sessions.get(selectJob.value) : undefined,
)
const selectedReply = computed(() =>
  selectJob.value ? helper.chatModel.bossReplySessions.get(selectJob.value) : undefined,
)
const selectedJob = computed(() =>
  selectJob.value ? helper.jobMaps.get(selectJob.value)?.jobData : undefined,
)
const replyActionLoading = ref(false)
const toast = useToast()

const messages = computed(() => {
  if (!selectJob.value) return
  if (isBossHelper.value && selectedSession.value?.kind !== 'boss') return
  return helper.chatModel.states.get(selectJob.value)
})

const selectedHasMessages = computed(() => Boolean(messages.value?.messagesRef.value.length))
const selectedContextLoading = computed(
  () =>
    selectedSession.value?.historyStatus === 'loading' ||
    selectedSession.value?.jobContextStatus === 'loading',
)

const bossReplyIndicatorClass = computed(() => {
  switch (helper.chatModel.bossReply.value.status) {
    case 'ready':
    case 'sent':
    case 'ignored':
      return 'bg-emerald-500'
    case 'queued':
    case 'generating':
    case 'draft':
    case 'awaiting_human':
    case 'paused':
      return 'bg-amber-500'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-gray-400'
  }
})

const selectedReplyPaused = computed(() =>
  ['paused', 'awaiting_human', 'error'].includes(selectedReply.value?.status ?? ''),
)

async function triggerSelectedReply(): Promise<void> {
  if (!selectJob.value || selectedSession.value?.kind !== 'boss') return
  replyActionLoading.value = true
  try {
    await helper.triggerBossAiReply(selectJob.value)
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    replyActionLoading.value = false
  }
}

async function triggerSelectedFollowUp(): Promise<void> {
  if (!selectJob.value || selectedSession.value?.kind !== 'boss') return
  replyActionLoading.value = true
  try {
    await helper.triggerBossAiFollowUp(selectJob.value)
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    replyActionLoading.value = false
  }
}

async function toggleSelectedReplyPause(): Promise<void> {
  if (!selectJob.value || selectedSession.value?.kind !== 'boss') return
  replyActionLoading.value = true
  try {
    if (selectedReplyPaused.value) await helper.resumeBossAiReply(selectJob.value)
    else await helper.pauseBossAiReply(selectJob.value)
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    replyActionLoading.value = false
  }
}

async function copySelectedReply(): Promise<void> {
  const reply = selectedReply.value?.decision?.reply
  if (!reply) return
  try {
    await navigator.clipboard.writeText(reply)
    toast.add({ title: '回复草稿已复制', color: 'success' })
  } catch (error) {
    toast.add({
      title: `复制失败：${error instanceof Error ? error.message : String(error)}`,
      color: 'error',
    })
  }
}

async function sendSelectedDraft(): Promise<void> {
  const sessionKey = selectJob.value
  if (!sessionKey || selectedSession.value?.kind !== 'boss' || replyActionLoading.value) return
  replyActionLoading.value = true
  try {
    await helper.sendBossAiDraft(sessionKey)
    if (helper.chatModel.bossReplySessions.get(sessionKey)?.status === 'sent') {
      toast.add({ title: 'AI 草稿已发送', color: 'success' })
    }
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    replyActionLoading.value = false
  }
}

watch(
  () => helper.currentJob.value,
  (v) => {
    if (following.value && v && visibleSessionKeys.value.includes(v)) {
      selectJob.value = v
    }
  },
)

watch(
  visibleSessionKeys,
  (sessionKeys) => {
    if (selectJob.value && sessionKeys.includes(selectJob.value)) return
    selectJob.value = sessionKeys[0] ?? null
  },
  { immediate: true },
)

watch(
  selectJob,
  (sessionKey) => {
    if (!isBossHelper.value || !sessionKey || selectedSession.value?.kind !== 'boss') return
    void helper.loadBossSessionContext(sessionKey).catch((error) => {
      toast.add({
        title: error instanceof Error ? error.message : String(error),
        color: 'error',
      })
    })
  },
  { immediate: true },
)

watch(
  [
    () => open.value,
    selectJob,
    () => selectedSession.value?.unreadCount,
    () => selectedSession.value?.unreadState,
  ],
  ([isOpen, sessionKey, unreadCount, unreadState]) => {
    if (!isBossHelper.value || !isOpen || !sessionKey || selectedSession.value?.kind !== 'boss')
      return
    if (unreadState === 'read' && !unreadCount) return
    void helper.markBossSessionRead(sessionKey).catch((error) => {
      toast.add({
        title: `标记会话已读失败：${error instanceof Error ? error.message : String(error)}`,
        color: 'error',
      })
    })
  },
  { immediate: true },
)

function onClient(jobKey: string) {
  if (!visibleSessionKeys.value.includes(jobKey)) return
  selectJob.value = jobKey
  following.value = false
}

function isMessage(message: UIMessage): message is Message {
  return true
}

const activeDots = ref<Set<number>>(new Set())
let patternIndex = 0
let stepIndex = 0

const size = 4
const gap = 2
const totalDots = size * size

const patterns = [
  [[0], [1], [2], [3], [7], [11], [15], [14], [13], [12], [8], [4], [5], [6], [10], [9]],
  [
    [0, 4, 8, 12],
    [1, 5, 9, 13],
    [2, 6, 10, 14],
    [3, 7, 11, 15],
  ],
  [
    [5, 6, 9, 10],
    [1, 4, 7, 8, 11, 14],
    [0, 3, 12, 15],
    [1, 4, 7, 8, 11, 14],
    [5, 6, 9, 10],
  ],
  [[0], [1, 4], [2, 5, 8], [3, 6, 9, 12], [7, 10, 13], [11, 14], [15]],
]

function nextStep() {
  const pattern = patterns[patternIndex]
  if (!pattern) return

  activeDots.value = new Set(pattern[stepIndex])
  stepIndex++

  if (stepIndex >= pattern.length) {
    stepIndex = 0
    patternIndex = (patternIndex + 1) % patterns.length
  }
}

const statusMessages = ['Searching...', 'Reading...', 'Analyzing...', 'Thinking...']
const currentIndex = ref(0)
const displayedText = ref(statusMessages[0]!)
const chars = 'abcdefghijklmnopqrstuvwxyz'

function scramble(from: string, to: string) {
  const maxLength = Math.max(from.length, to.length)
  let frame = 0
  const totalFrames = 15

  const step = () => {
    frame++
    let result = ''
    const progress = (frame / totalFrames) * maxLength

    for (let i = 0; i < maxLength; i++) {
      if (i < progress - 2) {
        result += to[i] || ''
      } else if (i < progress) {
        result += chars[Math.floor(Math.random() * chars.length)]
      } else {
        result += from[i] || ''
      }
    }

    displayedText.value = result

    if (frame < totalFrames) {
      requestAnimationFrame(step)
    } else {
      displayedText.value = to
    }
  }

  requestAnimationFrame(step)
}

let matrixInterval: ReturnType<typeof setInterval> | undefined
let textInterval: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  nextStep()
  matrixInterval = setInterval(nextStep, 120)
  textInterval = setInterval(() => {
    const prev = displayedText.value
    currentIndex.value = (currentIndex.value + 1) % statusMessages.length
    scramble(prev, statusMessages[currentIndex.value]!)
  }, 3000)
})

onUnmounted(() => {
  clearInterval(matrixInterval)
  clearInterval(textInterval)
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :side="appearanceConf.leftChat ? 'left' : 'right'"
    inset
    :dismissible="false"
    :modal="false"
    :content="slideoverContentProps"
    :ui="{
      body: 'flex min-h-0 flex-1 overflow-hidden p-0',
      content: 'top-14 z-190 w-[900px] max-w-[96vw]',
    }"
  >
    <template #header>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <UIcon name="i-lucide-messages-square" class="size-5 shrink-0 text-primary" />
        <span class="truncate font-semibold">
          {{ isBossHelper ? 'BossHelper 会话' : 'AI 对话' }}
        </span>
        <UBadge v-if="isBossHelper" color="neutral" variant="soft" size="sm">
          {{ sessionCountLabel }} 个
        </UBadge>
      </div>

      <UFieldGroup>
        <UButton
          size="md"
          :color="following ? 'primary' : 'neutral'"
          variant="ghost"
          @click="
            () => {
              following = !following
            }
          "
          icon="i-lucide-crosshair"
          title="自动跟随"
          aria-label="切换自动跟随当前会话"
        >
        </UButton>
        <UButton
          size="md"
          color="neutral"
          variant="ghost"
          @click="
            () => {
              open = false
            }
          "
          icon="i-lucide-x"
          title="关闭"
          aria-label="关闭聊天面板"
        >
        </UButton>
      </UFieldGroup>
    </template>
    <template #body>
      <div class="flex min-h-0 flex-1 overflow-hidden">
        <aside
          v-if="isBossHelper"
          class="flex w-64 shrink-0 flex-col border-r border-default bg-muted/30 max-md:w-52"
          aria-label="BOSS 会话导航"
        >
          <div class="space-y-2 border-b border-default p-3">
            <div class="flex items-center justify-between text-xs font-medium text-muted">
              <span>最近会话</span>
              <span class="tabular-nums">{{ filteredSessions.length }}/{{ sessions.length }}</span>
            </div>
            <label for="boss-session-search" class="sr-only">搜索 BOSS 会话</label>
            <UInput
              id="boss-session-search"
              v-model="sessionSearch"
              icon="i-lucide-search"
              placeholder="搜索 HR、公司、岗位或消息"
              autocomplete="off"
              class="w-full"
              :ui="{ base: 'h-10' }"
              aria-label="按关键词搜索 BOSS 会话"
            />
            <div class="grid grid-cols-3 gap-1" role="group" aria-label="按已读状态筛选会话">
              <button
                v-for="item in sessionFilterItems"
                :key="item.value"
                type="button"
                class="flex min-h-10 cursor-pointer items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                :class="
                  sessionReadFilter === item.value
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted hover:bg-elevated hover:text-highlighted active:bg-accented'
                "
                :aria-pressed="sessionReadFilter === item.value"
                :title="item.title"
                @click="sessionReadFilter = item.value"
              >
                <span>{{ item.label }}</span>
                <span class="tabular-nums opacity-75">{{ item.count }}</span>
              </button>
            </div>
          </div>
          <nav class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2" aria-label="招聘者会话列表">
            <button
              v-for="session in filteredSessions"
              :key="session.key"
              type="button"
              class="flex min-h-16 w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="
                selectJob === session.key
                  ? 'border-primary/50 bg-primary/10 text-highlighted'
                  : 'border-transparent hover:bg-elevated active:bg-accented'
              "
              :aria-current="selectJob === session.key ? 'true' : undefined"
              :title="
                [session.meta?.title || session.key, session.lastText || session.meta?.subtitle]
                  .filter(Boolean)
                  .join('：')
              "
              @click="onClient(session.key)"
            >
              <UAvatar
                :src="
                  session.meta?.avatar ||
                  session.job?.jobData.brand.logo ||
                  session.job?.jobData.boss.avatar
                "
                :alt="session.meta?.title || session.job?.jobData.boss.name || '招聘者头像'"
                size="md"
                class="shrink-0"
              />
              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-center gap-1.5">
                  <span class="min-w-0 flex-1 truncate text-sm font-medium">
                    {{
                      session.meta?.title ||
                      session.job?.jobData.boss.name ||
                      session.job?.jobData.positionName ||
                      session.key
                    }}
                  </span>
                  <UBadge
                    v-if="session.unreadCount > 0"
                    color="primary"
                    variant="solid"
                    size="xs"
                    class="shrink-0 tabular-nums"
                    :aria-label="`${session.unreadCount} 条未读消息`"
                  >
                    {{ session.unreadCount > 99 ? '99+' : session.unreadCount }}
                  </UBadge>
                </span>
                <span class="mt-0.5 block truncate text-xs text-muted">
                  {{ session.lastText || session.meta?.subtitle || '暂无消息' }}
                </span>
              </span>
            </button>
            <div
              v-if="filteredSessions.length === 0"
              class="flex flex-col items-center px-3 py-8 text-center text-xs text-muted"
              role="status"
            >
              <UIcon
                :name="sessions.length === 0 ? 'i-lucide-loader-circle' : 'i-lucide-search-x'"
                class="mb-2 size-5"
                :class="sessions.length === 0 ? 'animate-spin' : ''"
              />
              <span>
                {{ sessions.length === 0 ? '正在读取会话…' : '没有匹配的会话' }}
              </span>
              <UButton
                v-if="sessions.length > 0 && hasSessionFilter"
                size="xs"
                color="neutral"
                variant="ghost"
                class="mt-2"
                @click="clearSessionFilter"
              >
                清除筛选
              </UButton>
            </div>
          </nav>
        </aside>

        <section class="flex min-w-0 flex-1 flex-col overflow-hidden" aria-label="当前聊天内容">
          <div
            v-if="isBossHelper && selectJob"
            class="shrink-0 border-b border-default bg-default px-3 py-3"
          >
            <div class="flex min-w-0 items-center gap-3">
              <UAvatar
                :src="
                  selectedSession?.avatar || selectedJob?.brand.logo || selectedJob?.boss.avatar
                "
                :alt="selectedSession?.title || selectedJob?.boss.name || '招聘者头像'"
                size="lg"
                class="shrink-0"
              />
              <div class="min-w-0 flex-1">
                <h2 class="truncate text-sm font-semibold">
                  {{ selectedSession?.title || selectedJob?.boss.name || '未知招聘者' }}
                </h2>
                <p class="mt-0.5 truncate text-xs text-muted">
                  {{
                    [
                      selectedSession?.companyName || selectedJob?.brand.name,
                      selectedSession?.jobName || selectedJob?.jobName,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '岗位信息读取中'
                  }}
                </p>
              </div>
            </div>
            <div class="mt-2 grid gap-1 text-xs text-muted">
              <div
                class="flex min-w-0 items-center gap-1.5"
                :title="selectedSession?.historyMessage"
              >
                <UIcon
                  :name="
                    selectedSession?.historyStatus === 'error'
                      ? 'i-lucide-circle-alert'
                      : selectedSession?.historyStatus === 'loading'
                        ? 'i-lucide-loader-circle'
                        : 'i-lucide-messages-square'
                  "
                  class="size-3.5 shrink-0"
                  :class="selectedSession?.historyStatus === 'loading' ? 'animate-spin' : ''"
                />
                <span class="truncate">
                  {{ selectedSession?.historyMessage || '聊天记录尚未读取' }}
                </span>
              </div>
              <div
                class="flex min-w-0 items-center gap-1.5"
                :title="selectedSession?.jobContextMessage"
              >
                <UIcon
                  :name="
                    selectedSession?.jobContextStatus === 'error'
                      ? 'i-lucide-circle-alert'
                      : selectedSession?.jobContextStatus === 'loading'
                        ? 'i-lucide-loader-circle'
                        : 'i-lucide-briefcase-business'
                  "
                  class="size-3.5 shrink-0"
                  :class="selectedSession?.jobContextStatus === 'loading' ? 'animate-spin' : ''"
                />
                <span class="truncate">
                  {{ selectedSession?.jobContextMessage || '岗位信息尚未读取' }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="isBossHelper" class="shrink-0 space-y-2 p-2 pb-0 text-xs">
            <div class="rounded-lg border border-default bg-muted/40 px-3 py-2 text-muted">
              {{ helper.chatModel.bossSnapshot.value.message }}
            </div>

            <div class="rounded-lg border border-default bg-muted/40 px-3 py-2">
              <div class="flex flex-wrap items-center gap-2 font-medium">
                <span class="size-2 shrink-0 rounded-full" :class="bossReplyIndicatorClass" />
                <span class="min-w-32 flex-1">{{ helper.chatModel.bossReply.value.message }}</span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :loading="replyActionLoading"
                  :disabled="
                    !selectJob ||
                    !helper.conf.formData.aiReply.enable ||
                    selectedContextLoading ||
                    selectedReplyPaused
                  "
                  @click="triggerSelectedReply"
                >
                  处理当前消息
                </UButton>
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  :loading="replyActionLoading"
                  :disabled="
                    !selectJob ||
                    !selectedHasMessages ||
                    !helper.conf.formData.aiReply.enable ||
                    selectedContextLoading ||
                    selectedReplyPaused
                  "
                  @click="triggerSelectedFollowUp"
                >
                  主动跟进
                </UButton>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :loading="replyActionLoading"
                  :disabled="!selectJob"
                  @click="toggleSelectedReplyPause"
                >
                  {{ selectedReplyPaused ? '恢复' : '暂停' }}
                </UButton>
              </div>

              <div v-if="selectedReply" class="mt-2 border-t border-default pt-2">
                <div>{{ selectedReply.message }}</div>
                <div v-if="selectedReply.decision?.reason" class="mt-1 text-muted">
                  原因：{{ selectedReply.decision.reason }}
                </div>
                <div
                  v-if="selectedReply.decision?.needsHumanReview"
                  class="mt-1 text-amber-600 dark:text-amber-400"
                >
                  待人工核验：{{ selectedReply.decision.unansweredTopics.join('、') }}
                </div>
                <div
                  v-if="selectedReply.decision?.reply"
                  class="mt-2 whitespace-pre-wrap rounded-md bg-default px-3 py-2 text-sm"
                >
                  {{ selectedReply.decision.reply }}
                  <div v-if="selectedReply.status === 'draft'" class="mt-2 flex justify-end">
                    <UButton size="xs" color="neutral" variant="outline" @click="copySelectedReply">
                      复制草稿
                    </UButton>
                    <UButton
                      size="xs"
                      class="ml-2"
                      :loading="replyActionLoading"
                      :disabled="replyActionLoading"
                      @click="sendSelectedDraft"
                    >
                      确认发送
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            <div
              v-if="isBossHelper && !selectJob"
              class="flex h-full items-center justify-center px-6 text-center text-sm text-muted"
            >
              正在等待会话摘要或 HR 新消息，无需前往聊天页手动刷新
            </div>
            <div
              v-else-if="
                selectedSession?.readOnly && messages && messages.messagesRef.value.length === 0
              "
              class="flex h-full items-center justify-center px-6 text-center text-sm text-muted"
            >
              {{
                selectedSession?.historyStatus === 'loading'
                  ? '正在读取该会话的聊天记录…'
                  : '已识别该会话，暂无可展示的文本消息'
              }}
            </div>
            <UChatMessages
              v-else-if="selectJob && messages"
              :key="selectJob"
              ref="chatMessages"
              class="h-full min-h-0"
              :messages="messages.messagesRef.value"
              :user="{ variant: 'subtle', ui: { container: 'max-w-[85%] gap-1.5' } }"
              :assistant="{ variant: 'subtle', ui: { container: 'gap-1.5' } }"
              should-auto-scroll
              should-scroll-to-bottom
              :status="messages.statusRef.value"
              :ui="{
                indicator: 'bg-red-300',
              }"
            >
              <template #content="{ message }">
                <template v-if="isMessage(message)">
                  <template
                    v-for="(part, index) in message.parts"
                    :key="`${message.id}-${part.type}-${index}`"
                  >
                    <UChatReasoning
                      v-if="isReasoningUIPart(part)"
                      :text="part.text"
                      :streaming="isPartStreaming(part)"
                    >
                      <p class="whitespace-pre-wrap">
                        {{ part.text }}
                      </p>
                    </UChatReasoning>
                    <UChatTool
                      v-else-if="isToolUIPart(part)"
                      :text="getToolName(part)"
                      :streaming="isToolStreaming(part)"
                    />

                    <p v-else-if="isTextUIPart(part)" class="whitespace-pre-wrap">
                      {{
                        message.uiRole === 'filtering'
                          ? parseFiltering(part.text).message
                          : part.text
                      }}
                    </p>
                  </template>
                </template>
              </template>
              <template #indicator>
                <div class="indicator flex items-center gap-2 overflow-hidden text-muted">
                  <div
                    class="grid size-4 shrink-0"
                    :style="{
                      gridTemplateColumns: `repeat(${size}, 1fr)`,
                      gap: `${gap}px`,
                    }"
                  >
                    <span
                      v-for="i in totalDots"
                      :key="i"
                      class="rounded-sm bg-current transition-opacity duration-100"
                      :class="activeDots.has(i - 1) ? 'opacity-100' : 'opacity-20'"
                    />
                  </div>

                  <UChatShimmer :text="displayedText" class="font-mono text-sm" />
                </div>
              </template>
            </UChatMessages>
          </div>
        </section>
      </div>
    </template>
    <template #footer>
      <div
        v-if="selectedSession?.readOnly"
        class="py-2 pl-64 pr-3 text-center text-xs text-muted max-md:pl-52"
      >
        HR 新消息按 AI 回复策略处理；手动处理已有会话或主动跟进只生成草稿
      </div>
      <UChatPrompt
        v-else-if="selectJob || !isBossHelper"
        variant="soft"
        v-model="helper.pendingMessages.value"
      >
        <UChatPromptSubmit v-if="messages" :status="messages.statusRef.value" />
      </UChatPrompt>
      <div v-else class="py-2 text-center text-xs text-muted">等待 BOSS 会话载入</div>
    </template>
  </USlideover>
</template>

<style scoped>
/* article.group\/message[data-role="assistant"] > indicator{
.container{
  [data-slot="container"]{

  }
}
} */
</style>
