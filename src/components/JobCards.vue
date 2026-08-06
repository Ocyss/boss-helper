<script lang="ts" setup>
import { DropdownMenuItem } from '@nuxt/ui'
import { ref } from 'vue'

import type { JobStatus } from '@/composables/useApplying/type'
import type { JobData } from '@/composables/useHelper'
import { useHelper } from '@/composables/useHelper'

const helper = useHelper()

// 记录每一行的 DOM 引用，供“自动跟随”在岗位状态变化时定位到当前岗位。
const jobSetRef = ref<Record<string, Element | null>>({})
const following = ref(true)
const listContainer = ref<HTMLDivElement>()
const expandedJobKey = ref<string | null>(null)
const detailLoadingKey = ref<string | null>(null)
const detailMessages = ref<Record<string, string>>({})

const filterItemsChecked = ref<Record<string, boolean>>({})

const statusLabels: Record<JobStatus, string> = {
  pending: '未开始',
  wait: '等待中',
  running: '运行中',
  request: '请求中',
  ai: 'AI处理中',
  success: '成功',
  warn: '待人工',
  error: '错误',
}

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

// 只保留当前筛选条件下的岗位，筛选逻辑与投递工作流共用同一份结果状态。
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

// 返回岗位当前任务结果，模板不直接操作 Map，避免重复取值和空值分支。
function getJobResult(job: JobData) {
  return helper.jobResultMaps.get(job.key)
}

// 将内部状态转换成面向用户的短文本，确保列表中不显示 undefined。
function getStatusLabel(job: JobData) {
  const status = getJobResult(job)?.status
  return status ? statusLabels[status] : '未开始'
}

// 使用稳定的状态类名表达阶段，不依赖旧卡片的颜色变量或布局规则。
function getStatusClass(job: JobData) {
  const status = getJobResult(job)?.status ?? 'pending'
  return `job-status-${status}`
}

// 显示工作流阶段；尚未进入工作流时明确标为未开始。
function getStageLabel(job: JobData) {
  return getJobResult(job)?.id ?? '未开始'
}

// 只展示脱敏后的错误/警告原因，不回显完整模型响应或聊天内容。
function getReason(job: JobData) {
  const result = getJobResult(job)
  if (!result) return '—'
  if (result.reason) return result.reason
  if (result.status === 'error' || result.status === 'warn') {
    return result.msg ?? '任务未通过'
  }
  return '—'
}

// 将活跃时间压缩为列表可读文本，缺失时使用原始描述或占位符。
function getActiveTime(job: JobData) {
  if (job.activeTime) {
    return new Date(job.activeTime).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return job.activeTimeStr || '—'
}

// 更新时间只保留本地时间，不暴露日志之外的内部对象。
function formatUpdatedTime(updatedAt?: string) {
  if (!updatedAt) return '—'
  const date = new Date(updatedAt)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// 详情行使用文本而非标签卡片，避免岗位信息再次变成卡片堆叠。
function joinValues(values?: string[]) {
  return values?.filter(Boolean).join('、') || '—'
}

function filterSelectAll() {
  filterItems.value.forEach((item) => (filterItemsChecked.value[item.value] = true))
}

function filterToggle() {
  filterItems.value.forEach(
    (item) =>
      (filterItemsChecked.value[item.value] = !(filterItemsChecked.value[item.value] ?? true)),
  )
}

// 保留列表容器滚动，手动滚动后停止自动跟随，避免用户查看内容时被拉回。
function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (!listContainer.value) return
  listContainer.value.scrollTop += e.deltaY
  following.value = false
}

// 点击详情时重新读取岗位描述；DOM 或登录状态异常会以错误文本呈现并停止后续动作。
async function toggleDetails(job: JobData) {
  if (expandedJobKey.value === job.key) {
    expandedJobKey.value = null
    return
  }

  expandedJobKey.value = job.key
  detailLoadingKey.value = job.key
  detailMessages.value[job.key] = ''
  try {
    await helper.onJobCardClick(job.key)
  } catch (error) {
    detailMessages.value[job.key] = error instanceof Error ? error.message : String(error)
  } finally {
    if (detailLoadingKey.value === job.key) detailLoadingKey.value = null
  }
}

// 让状态变化后的当前岗位滚动到可见区域，保持原有跟随能力。
function scrollHandler(key = helper.currentJob.value) {
  if (!key) return
  jobSetRef.value[key]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}

watch(
  () => helper.currentJob.value,
  (value) => {
    if (following.value && value) scrollHandler(value)
  },
)
</script>

<template>
  <div style="order: -1" class="boss-helper-list-panel relative">
    <div ref="listContainer" class="job-list-container" @wheel.stop="onWheel">
      <table class="job-table">
        <caption class="sr-only">
          岗位处理列表
        </caption>
        <thead>
          <tr>
            <th scope="col">状态</th>
            <th scope="col">岗位</th>
            <th scope="col">公司</th>
            <th scope="col">城市</th>
            <th scope="col">薪资</th>
            <th scope="col">活跃时间</th>
            <th scope="col">AI 分数</th>
            <th scope="col">阶段</th>
            <th scope="col">错误/原因</th>
            <th scope="col">更新时间</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="job in jobList" :key="job.key">
            <tr
              :ref="(value) => (jobSetRef[job.key] = value as Element | null)"
              class="job-table-row"
              tabindex="0"
              @keydown.enter="toggleDetails(job)"
            >
              <td>
                <span class="job-status-text" :class="getStatusClass(job)">
                  {{ getStatusLabel(job) }}
                </span>
              </td>
              <td class="job-title-cell">
                <a
                  v-if="job.link"
                  :href="job.link"
                  target="_blank"
                  rel="noreferrer"
                  class="job-title-link"
                >
                  {{ job.jobName || job.positionName || '未命名岗位' }}
                </a>
                <span v-else class="job-title-link">
                  {{ job.jobName || job.positionName || '未命名岗位' }}
                </span>
                <span class="job-subtext"
                  >{{ job.experienceName || '经验不限' }} · {{ job.degreeName || '学历不限' }}</span
                >
              </td>
              <td class="job-company-cell">{{ job.brand?.name || '—' }}</td>
              <td>{{ job.city || job.address || '—' }}</td>
              <td class="job-salary-cell">{{ job.salary || '面议' }}</td>
              <td>{{ getActiveTime(job) }}</td>
              <td class="job-score-cell">{{ getJobResult(job)?.aiScore ?? '—' }}</td>
              <td>{{ getStageLabel(job) }}</td>
              <td class="job-reason-cell" :title="getReason(job)">{{ getReason(job) }}</td>
              <td>{{ formatUpdatedTime(getJobResult(job)?.updatedAt) }}</td>
              <td class="job-actions-cell">
                <button
                  type="button"
                  class="job-table-action"
                  :aria-expanded="expandedJobKey === job.key"
                  @click.stop="toggleDetails(job)"
                >
                  {{ expandedJobKey === job.key ? '收起' : '详情' }}
                </button>
              </td>
            </tr>
            <tr v-if="expandedJobKey === job.key" class="job-detail-row">
              <td colspan="11">
                <div v-if="detailLoadingKey === job.key" class="job-detail-message">
                  正在读取岗位详情…
                </div>
                <div v-else class="job-detail-grid">
                  <div>
                    <span class="job-detail-label">岗位描述</span>
                    <p class="job-detail-text">{{ job.jobDescription || '—' }}</p>
                  </div>
                  <div>
                    <span class="job-detail-label">技能/标签</span>
                    <p class="job-detail-text">
                      {{ joinValues([...job.skills, ...job.jobLabels]) }}
                    </p>
                  </div>
                  <div>
                    <span class="job-detail-label">福利</span>
                    <p class="job-detail-text">{{ joinValues(job.welfareList) }}</p>
                  </div>
                  <div v-if="getJobResult(job)?.draft">
                    <span class="job-detail-label">
                      {{
                        helper.conf.formData.autoDelivery.value
                          ? '招呼语（自动发送）'
                          : '招呼草稿（未发送）'
                      }}
                    </span>
                    <p class="job-detail-text">{{ getJobResult(job)?.draft }}</p>
                  </div>
                </div>
                <p v-if="detailMessages[job.key]" class="job-detail-error">
                  {{ detailMessages[job.key] }}
                </p>
              </td>
            </tr>
          </template>
          <tr v-if="jobList.length === 0">
            <td colspan="11" class="job-table-empty">当前筛选条件下暂无岗位</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="job-list-toolbar">
      <UButton
        size="md"
        :color="following ? 'primary' : 'neutral'"
        variant="outline"
        @click="following = !following"
        icon="i-lucide-accessibility"
        :title="following ? '已开启自动跟随' : '已暂停自动跟随'"
      >
        {{ following ? '跟随中' : '跟随' }}
      </UButton>
      <UDropdownMenu :items="filterItems" :content="{ side: 'top' }" :ui="{ content: 'w-48' }">
        <UButton size="md" color="neutral" variant="outline" icon="lucide:list-filter" title="过滤">
          过滤
        </UButton>
        <template #content-top>
          <div class="p-2 flex flex-wrap gap-1">
            <UButton size="sm" variant="outline" @click="filterSelectAll" label="全选" />
            <UButton size="sm" variant="outline" @click="filterToggle" label="反选" />
          </div>
        </template>
      </UDropdownMenu>
    </div>
  </div>
</template>
