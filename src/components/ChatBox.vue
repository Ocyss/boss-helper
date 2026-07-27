<script lang="ts" setup>
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'
import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart, UIMessage } from 'ai'

import { appearanceConf } from '@/composables/conf'
import { parseFiltering } from '@/composables/useApplying/utils'
import { useHelper } from '@/composables/useHelper'
import { VueChatState, Message } from '@/composables/useModel'

const open = defineModel('open', { default: false })
const following = ref(true)
const chatMessages = useTemplateRef('chatMessages') // TODO: auto scroll

const helper = useHelper()
const selectJob = ref(
  helper.chatModel.jobs.value.length > 0 ? helper.chatModel.jobs.value[0] : null,
)

const jobs = computed(() =>
  helper.chatModel.jobs.value.map((key) => ({
    key: key,
    job: helper.jobMaps.get(key),
    // result: helper.jobResultMaps.get(key),
    // messages: helper.chatModel.messages.get(key),
  })),
)

const messages = computed(() => {
  if (!selectJob.value) return
  return helper.chatModel.states.get(selectJob.value)
})

watch(
  () => helper.currentJob.value,
  (v) => {
    if (following.value && v) {
      selectJob.value = v
    }
  },
)

function onClient(jobKey: string) {
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
    :ui="{ body: 'flex flex-col overscroll-contain p-2', content: 'top-14 z-190' }"
    :style="{
      width: `${appearanceConf.chatBoxWidth}px`,
    }"
  >
    <template #header>
      <div class="flex flex-row overflow-x-auto gap-1 flex-1">
        <UButton
          v-for="job in jobs"
          :avatar="{
            src: job.job?.jobData.brand.logo ?? job.job?.jobData.boss.avatar,
            loading: 'lazy',
          }"
          size="md"
          :color="selectJob === job.key ? 'primary' : 'neutral'"
          variant="outline"
          @click="onClient(job.key)"
          :title="job.job?.jobData?.jobName || job.job?.jobData?.positionName || job.key"
        >
          {{ job.job?.jobData.boss.name || job.job?.jobData.positionName || job.key }}
        </UButton>
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
          icon="i-lucide-accessibility"
          title="自动跟随"
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
        >
        </UButton>
      </UFieldGroup>
    </template>
    <template #body>
      <UChatMessages
        v-if="selectJob && messages"
        :key="selectJob"
        ref="chatMessages"
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
                {{ message.uiRole === 'filtering' ? parseFiltering(part.text).message : part.text }}
              </p>
            </template>
          </template>
        </template>
        <template #indicator>
          <div class="indicator flex items-center gap-2 text-muted overflow-hidden">
            <div
              class="shrink-0 grid size-4"
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

            <UChatShimmer :text="displayedText" class="text-sm font-mono" />
          </div>
        </template>
      </UChatMessages>
    </template>
    <template #footer>
      <UChatPrompt variant="soft">
        <UChatPromptSubmit v-if="messages" :status="messages.statusRef.value" />
      </UChatPrompt>
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
