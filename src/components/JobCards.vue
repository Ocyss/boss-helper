<script lang="ts" setup>
import type { ComponentPublicInstance } from 'vue'
import { ref } from 'vue'

import JobCard from '@/components/JobCard.vue'
import { useHelper } from '@/composables/useHelper'

const jobSetRef = ref<Record<string, Element | ComponentPublicInstance | null>>({})
const following = ref(true)

const cards = ref<HTMLDivElement>()
const helper = useHelper()

function onWheel(e: any) {
  e.preventDefault()
  if (!cards.value) {
    return
  }
  const left = -e.wheelDelta || e.deltaY / 2
  cards.value.scrollLeft = cards.value.scrollLeft + left
  following.value = false
}
function scrollHandler(key = helper.currentJob.value) {
  if (!key) {
    return
  }
  const d = jobSetRef.value[key]
  if (!d) {
    return
  }

  if ('scrollIntoView' in d) {
    d.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  } else if ('$el' in d) {
    d?.$el.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }
}

watch(
  () => helper.currentJob.value,
  (v) => {
    if (following.value && v) {
      scrollHandler(v)
    }
  },
)
</script>

<template>
  <div style="order: -1" class="boss-helper-card relative">
    <div ref="cards" class="card-grid" @wheel.stop="onWheel">
      <JobCard
        v-for="job in helper.jobList.value"
        :ref="
          (ref) => {
            jobSetRef[job.key] = ref
          }
        "
        :key="job.key"
        :job="job"
        hover
      />
    </div>
    <UButton
      size="md"
      :color="following ? 'primary' : 'neutral'"
      variant="outline"
      @click="following = !following"
      icon="i-lucide-accessibility"
      title="自动跟随"
      class="absolute bottom-6 left-2"
    >
    </UButton>
    <div class="card-grid-overlay" />
  </div>
</template>
