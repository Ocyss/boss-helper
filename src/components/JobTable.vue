<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import type { HeaderContext } from '@tanstack/vue-table'
import { useStorageAsync } from '@vueuse/core'
import { computed, nextTick, onActivated, onMounted, ref, watch } from 'vue'

import { appearanceConf } from '@/composables/conf'
import type { JobStatus } from '@/composables/useApplying/type'
import type { JobData } from '@/composables/useHelper'
import { useHelper } from '@/composables/useHelper'
import { useJobActions } from '@/composables/useJobActions'
import { ExtStorage } from '@/message'

const props = defineProps<{ jobs: JobData[]; following: boolean }>()
const emit = defineEmits<{ 'update:following': [value: boolean] }>()
const helper = useHelper()
const actions = useJobActions()
const contextJob = ref<JobData>()
const contextOpen = ref(false)
const contextItems = computed(() => (contextJob.value ? actions.items(contextJob.value) : []))
function onContextmenu(_event: Event, row: TableRow<JobData>) {
  contextJob.value = row.original
}

// Keep row IDs unique at the table boundary, including in-place list updates.
const tableJobs = computed(() => {
  const seen = new Set<string>()
  return props.jobs.filter((job) => {
    if (seen.has(job.key)) return false
    seen.add(job.key)
    return true
  })
})

const expanded = ref<Record<string, boolean>>({})
const descriptions = ref<Record<string, { loading: boolean; error: string | null }>>({})
const layout = useStorageAsync(
  'job-table-layout-v1',
  {
    visibility: {} as Record<string, boolean>,
    sizing: {} as Record<string, number>,
    order: [] as string[],
  },
  ExtStorage,
  { mergeDefaults: true },
)
const columnVisibility = computed({
  get: () => layout.value.visibility,
  set: (value) => {
    layout.value.visibility = value
  },
})
const columnSizing = computed({
  get: () => layout.value.sizing,
  set: (value) => {
    layout.value.sizing = value
  },
})
const columns: TableColumn<JobData>[] = [
  { id: 'index', header: '#', enableHiding: false },
  { id: 'job', header: '岗位' },
  { id: 'company', header: '公司' },
  { id: 'salary', header: '薪资' },
  { id: 'hr', header: 'HR' },
  { id: 'status', header: '状态' },
  { id: 'address', header: '地点' },
  { id: 'skills', header: '标签 / 技能' },
  { id: 'welfare', header: '福利' },
  { id: 'actions', enableHiding: false },
]
const defaultWidths: Record<string, number> = {
  index: 110,
  job: 280,
  salary: 140,
  company: 280,
  hr: 210,
  address: 240,
  skills: 320,
  welfare: 260,
  status: 200,
  actions: 72,
}
for (const column of columns) {
  column.size = defaultWidths[column.id!]
  column.minSize = column.id === 'actions' ? 72 : column.id === 'index' ? 110 : 100
  column.maxSize = 800
  column.enableResizing = column.id !== 'actions'
  column.meta = {
    style: {
      th: ({ column }) => ({ width: `${column.getSize()}px` }),
      td: ({ column }) => ({ width: `${column.getSize()}px` }),
    },
  }
}
const movableIds = columns
  .filter((column) => column.enableHiding !== false)
  .map((column) => column.id!)
const columnOrder = computed({
  get: () => [
    'index',
    ...new Set([...layout.value.order.filter((id) => movableIds.includes(id)), ...movableIds]),
    'actions',
  ],
  set: (value: string[]) => {
    layout.value.order = value
  },
})
const tableWidth = computed(() =>
  columns.reduce((width, column) => {
    const id = column.id!
    if (columnVisibility.value[id] === false && column.enableHiding !== false) return width
    return (
      width +
      Math.min(column.maxSize!, Math.max(column.minSize!, columnSizing.value[id] ?? column.size!))
    )
  }, 0),
)
// Nuxt UI's dynamic slot types intersect header and cell contexts.
function resizeHeader(context: unknown) {
  return (context as HeaderContext<JobData, unknown>).header
}
const draggedColumn = ref<string>()
function startColumnDrag(event: DragEvent, id: string) {
  draggedColumn.value = id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
}
function dropColumn(id: string) {
  const source = draggedColumn.value
  draggedColumn.value = undefined
  if (!source || source === id || !movableIds.includes(id)) return
  const order = columnOrder.value.filter((column) => column !== source)
  order.splice(order.indexOf(id), 0, source)
  columnOrder.value = order
}
function resetLayout() {
  layout.value = { visibility: {}, sizing: {}, order: [] }
}
const columnItems = computed(() =>
  columns
    .filter((column) => column.enableHiding !== false)
    .map((column) => ({
      type: 'checkbox' as const,
      label: String(column.header),
      checked: columnVisibility.value[column.id!] !== false,
      onUpdateChecked(checked: boolean) {
        columnVisibility.value[column.id!] = checked
      },
      onSelect(event: Event) {
        event.preventDefault()
      },
    })),
)
const stateColors: Record<JobStatus, string> = {
  ready: '#3498db',
  pending: '#CECECE',
  wait: '#CECECE',
  error: '#e74c3c',
  warn: '#f39c12',
  success: '#2ecc71',
  running: '#98F5F9',
  request: '#3498db',
  ai: '#9b59b6',
}
const stateIcons: Partial<Record<JobStatus, string>> = {
  running: 'i-line-md-loading-twotone-loop',
  request: 'i-svg-spinners-wifi-fade',
  ai: 'i-line-md-hazard-lights-loop',
}

// This UTable version does not expose its virtualizer; onChange provides it.
type Virtualizer = {
  scrollToIndex: (index: number, options: { align: 'auto' }) => void
}
let virtualizer: Virtualizer | undefined
let pendingLocation = false
const currentIndex = computed(() =>
  tableJobs.value.findIndex((job) => job.key === helper.currentJob.value),
)
const virtualize = {
  estimateSize: 140,
  overscan: 8,
  onChange(instance: Virtualizer) {
    virtualizer = instance
    if (pendingLocation) {
      pendingLocation = false
      void nextTick(locateCurrent)
    }
  },
}

function locateCurrent() {
  if (!props.following || currentIndex.value < 0) return
  if (!virtualizer) {
    pendingLocation = true
    return
  }
  virtualizer.scrollToIndex(currentIndex.value, { align: 'auto' })
}
function stopFollowing() {
  pendingLocation = false
  if (props.following) emit('update:following', false)
}
watch(
  [() => props.following, () => helper.currentJob.value, currentIndex],
  async () => {
    await nextTick()
    locateCurrent()
  },
  { flush: 'post' },
)
onMounted(() => nextTick(locateCurrent))
onActivated(() => nextTick(locateCurrent))

async function loadDescription(key: string) {
  if (descriptions.value[key]?.loading) return
  descriptions.value[key] = { loading: true, error: null }
  const state = descriptions.value[key]!
  try {
    if (!(await actions.fetchDetails(key))) {
      state.error = '暂未获取岗位详情，请稍后重试'
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  } finally {
    state.loading = false
  }
}
function toggleDescription(key: string) {
  expanded.value[key] = !expanded.value[key]
  if (expanded.value[key]) void loadDescription(key)
}
function jobLabels(job: JobData) {
  const labels = [...new Set(job.jobLabels)]
  if (job.degreeName && ![...labels, ...job.skills].some((tag) => tag.includes(job.degreeName))) {
    labels.push(job.degreeName)
  }
  return labels
}
function activeColor(job: JobData): 'success' | 'warning' | 'error' {
  if (job.boss.isOnline) return 'success'
  if (!job.activeTime) return 'error'
  const days = (Date.now() - job.activeTime) / 86_400_000
  return days <= 2 ? 'success' : days <= 7 ? 'warning' : 'error'
}
function status(key: string) {
  const result = helper.jobResultMaps.get(key)
  const value = result?.status ?? 'pending'
  return {
    visible: !!result && value !== 'pending',
    color: stateColors[value],
    icon: stateIcons[value],
    title: result?.reason || result?.msg,
    text: result?.msg || result?.reason || (value === 'ready' ? '待投递' : '无内容'),
  }
}
</script>

<template>
  <div
    class="min-w-0 border-t border-default bg-default"
    @wheel.passive="stopFollowing"
    @touchmove.passive="stopFollowing"
  >
    <UContextMenu v-model:open="contextOpen" :items="contextItems">
      <UTable
        @contextmenu="onContextmenu"
        v-model:expanded="expanded"
        v-model:column-visibility="columnVisibility"
        v-model:column-sizing="columnSizing"
        v-model:column-order="columnOrder"
        :column-sizing-options="{ columnResizeMode: 'onChange' }"
        :data="tableJobs"
        :columns="columns"
        :get-row-id="(job: JobData) => job.key"
        :virtualize="virtualize"
        sticky
        class="overflow-auto bg-default overscroll-contain"
        :style="{
          height: `${appearanceConf.tableHeight * 10}px`,
          '--job-table-width': `${tableWidth}px`,
        }"
        :ui="{
          base: 'w-(--job-table-width) table-fixed',
          thead: 'bg-default',
          tbody: 'bg-default',
          td: 'align-middle whitespace-nowrap overflow-hidden',
          th: 'relative align-middle whitespace-nowrap',
        }"
      >
        <template
          v-for="definition in columns"
          :key="definition.id"
          #[`${definition.id}-header`]="context"
        >
          <div
            v-for="column in [context.column]"
            :key="column.id"
            class="flex min-w-0 items-center gap-2"
            @dragover.prevent
            @drop.prevent="dropColumn(column.id)"
          >
            <slot v-if="column.id === 'index'" name="following" />
            <span
              class="truncate select-none"
              :class="{
                'cursor-grab active:cursor-grabbing': movableIds.includes(column.id),
              }"
              :draggable="movableIds.includes(column.id)"
              :title="movableIds.includes(column.id) ? '拖动列名调整顺序' : undefined"
              @dragstart="startColumnDrag($event, column.id)"
              @dragend="draggedColumn = undefined"
              >{{ definition.header }}</span
            >
            <slot v-if="column.id === 'status'" name="filter" />
            <UDropdownMenu
              v-if="column.id === 'actions'"
              :items="columnItems"
              :ui="{ content: 'w-48' }"
            >
              <UButton
                size="md"
                color="neutral"
                variant="outline"
                icon="i-lucide-columns-3"
                aria-label="筛选显示列"
                title="筛选显示列"
              />
              <template #content-bottom>
                <div class="border-t border-default p-1">
                  <UButton
                    block
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    label="恢复默认布局"
                    @click="resetLayout"
                  />
                </div>
              </template>
            </UDropdownMenu>
          </div>
          <div
            v-if="context.column.getCanResize()"
            role="separator"
            aria-orientation="vertical"
            :aria-label="`调整${definition.header}列宽`"
            class="absolute inset-y-0 right-0 z-10 w-1.5 touch-none cursor-col-resize select-none hover:bg-primary/50"
            :class="{ 'bg-primary': context.column.getIsResizing() }"
            @mousedown.stop.prevent="resizeHeader(context).getResizeHandler()($event)"
            @touchstart.stop="resizeHeader(context).getResizeHandler()($event)"
            @dragstart.prevent
            @dblclick.stop="context.column.resetSize()"
          />
        </template>
        <template #index-cell="{ row }">
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              :icon="row.getIsExpanded() ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              :aria-label="row.getIsExpanded() ? '收起岗位描述' : '展开岗位描述'"
              :aria-expanded="row.getIsExpanded()"
              @click="toggleDescription(row.original.key)"
            />
            <span class="text-muted tabular-nums">{{ row.index + 1 }}</span>
          </div>
        </template>

        <template #job-cell="{ row }">
          <div class="truncate">
            <a
              :href="row.original.link"
              target="_blank"
              rel="noopener noreferrer"
              class="font-semibold text-primary hover:underline"
            >
              {{ row.original.jobName }}
            </a>
          </div>
        </template>
        <template #salary-cell="{ row }">
          <span class="font-semibold text-error">{{ row.original.salary }}</span>
        </template>
        <template #skills-cell="{ row }">
          <div
            class="flex w-full max-h-20 flex-wrap content-start gap-1 overflow-hidden whitespace-normal"
            :title="[...jobLabels(row.original), ...row.original.skills].join(' · ')"
          >
            <UBadge
              v-for="tag in jobLabels(row.original)"
              :key="tag"
              size="sm"
              variant="subtle"
              color="success"
              class="max-w-full h-6 shrink-0 truncate"
              >{{ tag }}</UBadge
            >
            <UBadge
              v-for="tag in row.original.skills"
              :key="tag"
              size="sm"
              variant="subtle"
              color="warning"
              class="max-w-full h-6 shrink-0 truncate"
              >{{ tag }}</UBadge
            >
          </div>
        </template>
        <template #welfare-cell="{ row }">
          <div
            class="w-full whitespace-normal text-xs leading-5 text-muted"
            :title="row.original.welfareList?.join(' · ')"
          >
            <span class="line-clamp-3 wrap-break-word">{{
              row.original.welfareList?.join(' · ')
            }}</span>
          </div>
        </template>
        <template #company-cell="{ row }">
          <div class="flex w-full items-center gap-2">
            <img
              :src="row.original.brand.logo"
              alt=""
              width="40"
              height="40"
              class="size-10 shrink-0 rounded object-contain"
              loading="lazy"
            />
            <div class="flex h-10 min-w-0 flex-1 flex-col justify-between">
              <div class="truncate text-sm font-medium" :title="row.original.brand.name">
                {{ row.original.brand.name }}
              </div>
              <div
                class="truncate text-xs text-muted"
                :title="`${row.original.brand.industry} · ${row.original.brand.scale}`"
              >
                {{ row.original.brand.industry }} ·
                {{ row.original.brand.scale }}
              </div>
            </div>
          </div>
        </template>

        <template #address-cell="{ row }">
          <div
            class="line-clamp-3 whitespace-normal wrap-break-word text-sm leading-5"
            :title="row.original.address"
          >
            {{ row.original.address }}
          </div>
        </template>
        <template #hr-cell="{ row }">
          <div class="flex items-center gap-2">
            <UAvatar
              :src="row.original.boss.avatar"
              :alt="row.original.boss.name"
              size="md"
              class="size-10 shrink-0"
            />
            <div class="flex h-10 min-w-0 flex-1 flex-col items-start justify-between">
              <span
                class="max-w-full truncate text-sm font-medium"
                :title="row.original.boss.name"
                >{{ row.original.boss.name }}</span
              >
              <UBadge
                v-if="
                  row.original.boss.isOnline ||
                  row.original.activeTime ||
                  row.original.activeTimeStr
                "
                size="sm"
                :color="activeColor(row.original)"
                variant="subtle"
                class="max-w-full truncate whitespace-nowrap"
              >
                {{
                  row.original.boss.isOnline
                    ? '在线'
                    : row.original.activeTimeStr ||
                      (row.original.activeTime
                        ? `${new Date(row.original.activeTime).toLocaleString('zh')}${
                            row.original.activeTimeStr ? ` (${row.original.activeTimeStr})` : ''
                          }`
                        : '')
                }}
              </UBadge>
            </div>
          </div>
        </template>
        <template #status-cell="{ row }">
          <div
            v-if="status(row.original.key).visible"
            :style="{ color: status(row.original.key).color }"
            :title="status(row.original.key).title"
            class="flex min-w-0 items-center gap-2"
          >
            <span class="truncate">{{ status(row.original.key).text }}</span>
          </div>
        </template>
        <template #expanded="{ row }">
          <div class="sticky left-0 max-w-275 whitespace-normal space-y-2 p-4">
            <div v-if="descriptions[row.original.key]?.loading" role="status">
              加载中...
              <USkeleton class="mt-2 h-4 w-full" />
              <USkeleton class="mt-2 h-4 w-4/5" />
            </div>
            <div v-else-if="descriptions[row.original.key]?.error" role="alert" class="space-y-2">
              <p class="text-error">
                {{ descriptions[row.original.key]?.error }}
              </p>
              <UButton size="sm" variant="outline" @click="loadDescription(row.original.key)"
                >重试</UButton
              >
            </div>
            <div v-else class="whitespace-pre-wrap wrap-break-word">
              {{ row.original.jobDescription || '暂无岗位描述' }}
            </div>
          </div>
        </template>
      </UTable>
    </UContextMenu>
  </div>
</template>
