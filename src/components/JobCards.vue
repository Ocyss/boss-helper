<script lang="ts" setup>
import { DropdownMenuItem } from '@nuxt/ui'
import type { ComponentPublicInstance } from 'vue'
import { ref } from 'vue'

import JobCard from '@/components/JobCard.vue'
import { useHelper } from '@/composables/useHelper'

const jobSetRef = ref<Record<string, Element | ComponentPublicInstance | null>>({})
const following = ref(true)

const cards = ref<HTMLDivElement>()
const helper = useHelper()

const filterItemsChecked = ref<Record<string, boolean>>({})

const filterItems = computed<(DropdownMenuItem & { value: string })[]>(() =>
  (
    [
      { type: 'checkbox', value: 'success', label: '投递成功', color: 'success' },
      ...(helper.workflow?.pipeline.value.map(
        (item) =>
          ({
            type: 'checkbox',
            label: item.label ?? item.id,
            value: item.id,
          }) satisfies DropdownMenuItem,
      ) ?? []),
      { type: 'checkbox', value: 'error', label: '投递错误', color: 'error' },
      { type: 'checkbox', value: 'not_started', label: '未开始' },
    ] satisfies DropdownMenuItem[]
  ).map((item) => ({
    ...item,
    checked: filterItemsChecked.value[item.value] ?? true,
    onUpdateChecked(checked: boolean) {
      filterItemsChecked.value[item.value] = checked
    },
    onSelect(e: Event) {
      e.preventDefault()
    },
  })),
)

const jobList = computed(() => {
  return helper.jobList.value.filter((job) => {
    const res = helper.jobResultMaps.get(job.key)
    if (!res || !res.id) {
      return filterItemsChecked.value.not_started ?? true
    }
    if (res.status === 'success') {
      return filterItemsChecked.value.success ?? true
    }
    if (res.status === 'error') {
      return filterItemsChecked.value.error ?? true
    }
    if (filterItemsChecked.value[res.id] === false) {
      return false
    }
    return true
  })
})

function filterSelectAll() {
  filterItems.value.forEach((item) => (filterItemsChecked.value[item.value] = true))
}

function filterToggle() {
  filterItems.value.forEach(
    (item) =>
      (filterItemsChecked.value[item.value] = !(filterItemsChecked.value[item.value] ?? true)),
  )
}

function onWheel(e: any) {
  e.preventDefault()
  if (!cards.value) {
    return
  }
  const delta = e.deltaY || -e.wheelDelta || 0
  cards.value.scrollTop += delta
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
    <div ref="cards" class="card-grid job-list-rows" @wheel.stop="onWheel">
      <JobCard
        v-for="job in jobList"
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
    <div class="flex gap-2 absolute bottom-6 left-2">
      <UButton
        size="md"
        :color="following ? 'primary' : 'neutral'"
        variant="outline"
        @click="following = !following"
        icon="i-lucide-accessibility"
        title="自动跟随"
      />
      <UDropdownMenu :items="filterItems" :content="{ side: 'top' }" :ui="{ content: 'w-48' }">
        <UButton
          size="md"
          color="neutral"
          variant="outline"
          icon="lucide:list-filter"
          title="过滤"
        />
        <template #content-top>
          <div class="p-2 flex flex-wrap gap-1">
            <UButton size="sm" variant="outline" @click="filterSelectAll" label="全选" />
            <UButton size="sm" variant="outline" @click="filterToggle" label="反选" />
          </div>
        </template>
      </UDropdownMenu>
    </div>

    <div class="card-grid-overlay" />
  </div>
</template>
