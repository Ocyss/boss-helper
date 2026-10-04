<script lang="ts" setup>
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ComponentPublicInstance } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import JobCard from '@/components/JobCard.vue'
import { useConf } from '@/composables/conf'
import type { JobData } from '@/composables/useHelper'
import { useHelper } from '@/composables/useHelper'

const helper = useHelper()
const conf = useConf()
const jobSetRef = ref<Record<string, Element | ComponentPublicInstance | null>>({})
const dismissedJobKeys = ref(new Set<string>())
const following = ref(true)
const changingBatch = ref(false)
const cards = ref<HTMLDivElement>()
const contextMenuRef = ref<HTMLElement>()
const filterItemsChecked = ref<Record<string, boolean>>({})

const contextMenu = reactive<{
  visible: boolean
  x: number
  y: number
  job: JobData | null
}>({ visible: false, x: 0, y: 0, job: null })

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
const ruleMatch = (items: string[], value: string) =>
  items.some((item) => item.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase())

const isJobBlocked = (job: JobData) =>
  ruleMatch(conf.formData.blockedCompanies, job.brand.name) ||
  ruleMatch(conf.formData.blockedHrs, job.boss.name)

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
      { type: 'checkbox', value: 'blocked', label: '已屏蔽', color: 'warning' },
      { type: 'checkbox', value: 'not_started', label: '未开始' },
    ] satisfies DropdownMenuItem[]
  ).map((item) => ({
    ...item,
    checked: filterItemsChecked.value[item.value] ?? true,
    onUpdateChecked(checked: boolean) {
      filterItemsChecked.value[item.value] = checked
    },
    onSelect(event: Event) {
      event.preventDefault()
    },
  })),
)

const jobList = computed(() =>
  helper.jobList.value.filter((job) => {
    if (dismissedJobKeys.value.has(job.key)) return false
    const result = helper.jobResultMaps.get(job.key)
    const blocked = isJobBlocked(job)
    if (blocked && filterItemsChecked.value.blocked === false) return false
    if (!result || !result.id) return filterItemsChecked.value.not_started ?? true
    if (result.status === 'success') return filterItemsChecked.value.success ?? true
    if (result.status === 'error') return filterItemsChecked.value.error ?? true
    if (filterItemsChecked.value[result.id] === false) return false
    return true
  }),
)

const isFiltered = computed(() => filterItems.value.some((item) => item.checked === false))

function filterSelectAll() {
  filterItems.value.forEach((item) => (filterItemsChecked.value[item.value] = true))
}

function filterToggle() {
  filterItems.value.forEach(
    (item) =>
      (filterItemsChecked.value[item.value] = !(filterItemsChecked.value[item.value] ?? true)),
  )
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  if (!cards.value) return
  cards.value.scrollLeft += event.deltaY || -event.wheelDelta
  following.value = false
}

function scrollHandler(key = helper.currentJob.value) {
  if (!key || !cards.value) return
  const target = jobSetRef.value[key]
  if (!target) return
  const element = ('$el' in target ? target.$el : target) as HTMLElement | null
  if (!element) return
  cards.value.scrollTo({
    left: element.offsetLeft - cards.value.clientWidth / 2 + element.offsetWidth / 2,
    behavior: 'smooth',
  })
}

async function changeBatch() {
  if (changingBatch.value || helper.workflowRunning.value) return
  changingBatch.value = true
  closeContextMenu()
  try {
    const changed = await helper.loadMoreJob(
      new Promise((resolve) => {
        setTimeout(resolve, 1200)
      }),
    )
    useToast().add({
      color: changed ? 'success' : 'warning',
      title: changed ? '已加载下一批职位' : '没有更多职位',
    })
  } finally {
    changingBatch.value = false
  }
}

function closeContextMenu() {
  contextMenu.visible = false
  contextMenu.job = null
}

function addRule(items: string[], value: string) {
  const item = normalize(value)
  if (item && !ruleMatch(items, item)) items.push(item)
}

function removeRule(items: string[], value: string) {
  const index = items.findIndex(
    (item) => item.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase(),
  )
  if (index >= 0) items.splice(index, 1)
}

async function toggleRule(kind: 'company' | 'hr') {
  const job = contextMenu.job
  if (!job) return
  const value = kind === 'company' ? job.brand.name : job.boss.name
  const items = kind === 'company' ? conf.formData.blockedCompanies : conf.formData.blockedHrs
  if (ruleMatch(items, value)) removeRule(items, value)
  else addRule(items, value)
  await conf.confSaving()
}

function dismissJob() {
  if (contextMenu.job)
    dismissedJobKeys.value = new Set(dismissedJobKeys.value).add(contextMenu.job.key)
  closeContextMenu()
}

async function openContextMenu(job: JobData, event: MouseEvent) {
  event.preventDefault()
  contextMenu.job = job
  contextMenu.visible = true
  await nextTick()
  const menu = contextMenuRef.value
  if (!menu) return
  const rect = menu.getBoundingClientRect()
  contextMenu.x = Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8))
  contextMenu.y = Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8))
}

function onGlobalPointerDown(event: PointerEvent) {
  if (contextMenu.visible && !event.composedPath().includes(contextMenuRef.value as EventTarget)) {
    closeContextMenu()
  }
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu()
}

watch(
  () => helper.currentJob.value,
  (value) => {
    if (following.value && value) scrollHandler(value)
  },
)

onMounted(() => {
  window.addEventListener('pointerdown', onGlobalPointerDown, true)
  window.addEventListener('keydown', onGlobalKeydown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onGlobalPointerDown, true)
  window.removeEventListener('keydown', onGlobalKeydown, true)
})
</script>

<template>
  <div style="order: -1" class="boss-helper-card relative">
    <div ref="cards" class="card-grid" @wheel.stop="onWheel" @scroll="closeContextMenu">
      <JobCard
        v-for="job in jobList"
        :ref="(element) => (jobSetRef[job.key] = element)"
        :key="job.key"
        :job="job"
        hover
        @contextmenu="openContextMenu(job, $event)"
      />
    </div>
    <div
      class="flex items-center gap-2 absolute bottom-4 left-4 z-10 p-1.5 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md rounded-xl shadow-md"
    >
      <UButton
        size="sm"
        :color="following ? 'primary' : 'neutral'"
        :variant="following ? 'soft' : 'outline'"
        icon="i-lucide-locate-fixed"
        @click="following = !following"
      >
        {{ following ? '自动跟随' : '跟随已暂停' }}
      </UButton>
      <UButton
        size="sm"
        color="primary"
        variant="outline"
        icon="i-lucide-refresh-cw"
        :loading="changingBatch"
        :disabled="helper.workflowRunning.value"
        @click="changeBatch"
      >
        换一批
      </UButton>
      <UDropdownMenu :items="filterItems" :content="{ side: 'top' }" :ui="{ content: 'w-52' }">
        <UButton
          size="sm"
          :color="isFiltered ? 'primary' : 'neutral'"
          variant="outline"
          icon="i-lucide-list-filter"
        >
          筛选
        </UButton>
        <template #content-top>
          <div class="p-2 flex gap-1">
            <UButton size="xs" variant="soft" @click="filterSelectAll">全选</UButton>
            <UButton size="xs" variant="soft" @click="filterToggle">反选</UButton>
          </div>
        </template>
      </UDropdownMenu>
    </div>

    <div
      v-if="contextMenu.visible && contextMenu.job"
      ref="contextMenuRef"
      class="job-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @contextmenu.prevent
      @pointerdown.stop
    >
      <div class="context-menu-title">{{ contextMenu.job.jobName }}</div>
      <UButton
        class="context-menu-action"
        color="neutral"
        variant="ghost"
        icon="i-lucide-eye-off"
        @click="dismissJob"
      >
        忽略本次
      </UButton>
      <UButton
        class="context-menu-action"
        color="neutral"
        variant="ghost"
        icon="i-lucide-building-2"
        @click="toggleRule('company')"
      >
        {{
          ruleMatch(conf.formData.blockedCompanies, contextMenu.job.brand.name)
            ? '取消屏蔽公司'
            : '屏蔽该公司'
        }}
      </UButton>
      <UButton
        v-if="contextMenu.job.boss.name"
        class="context-menu-action"
        color="neutral"
        variant="ghost"
        icon="i-lucide-user-x"
        @click="toggleRule('hr')"
      >
        {{
          ruleMatch(conf.formData.blockedHrs, contextMenu.job.boss.name)
            ? '取消屏蔽 HR'
            : '屏蔽该 HR'
        }}
      </UButton>
    </div>
    <div class="card-grid-overlay" />
  </div>
</template>
