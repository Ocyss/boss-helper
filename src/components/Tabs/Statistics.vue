<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'

import Alert from '@/components/Alert.vue'
import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'
import { useStatistics } from '@/composables/useStatistics'

const ctx = useHelper()

const statistics = useStatistics()

// const { next, page } = usePager()
const conf = useConf()
const statisticCycle = ref(1)
const diagnosticsOpen = ref(false)

const statisticCycleData = [
  {
    label: '近三日投递',
    help: '愿你每一次投递都能得到回应',
    date: 3,
  },
  {
    label: '本周投递',
    help: '愿你早日找到心满意足的工作',
    date: 7,
  },
  {
    label: '本月投递',
    help: '愿你在面试中得到满意的结果',
    date: 30,
  },
  {
    label: '历史投递',
    help: '愿你能早九晚五还双休带五险',
    date: -1,
  },
]

const cycle = computed(() => {
  const date = statisticCycleData[statisticCycle.value].date
  let ans = 0
  for (
    let i = 0;
    // eslint-disable-next-line no-unmodified-loop-condition
    (date === -1 || i < date - 1) && i < statistics.statisticsData.value.length;
    i++
  ) {
    ans += statistics.statisticsData.value[i].success
  }
  return ans
})

const greetingCycle = computed(() => {
  const date = statisticCycleData[statisticCycle.value].date
  let ans = 0
  for (
    let i = 0;
    (date === -1 || i < date - 1) && i < statistics.statisticsData.value.length;
    i++
  ) {
    ans += statistics.statisticsData.value[i].greetingSuccess ?? 0
  }
  return ans
})

const deliveryLimit = computed(() => {
  return conf.formData.deliveryLimit.value
})

const percentage = (value: number, total: number) => {
  if (total <= 0) return '0.0'
  return ((value / total) * 100).toFixed(1)
}

const filterPercentage = computed(() => {
  const { success, total } = statistics.todayData
  return percentage(Math.max(total - success, 0), total)
})

const repeatPercentage = computed(() => {
  const { repeat, total } = statistics.todayData
  return percentage(repeat, total)
})

const activityPercentage = computed(() => {
  const { activityFilter, total } = statistics.todayData
  return percentage(activityFilter, total)
})

const preflightColors = {
  success: 'success',
  warning: 'warning',
  error: 'error',
} as const

const simulationColors = {
  passed: 'success',
  filtered: 'warning',
  failed: 'error',
} as const

async function runPreflight() {
  diagnosticsOpen.value = true
  await ctx.preflight()
}

async function runSimulation() {
  diagnosticsOpen.value = true
  await ctx.simulate()
}

async function start() {
  await ctx.start()
  if (ctx.preflightReport.value && !ctx.preflightReport.value.ok) {
    diagnosticsOpen.value = true
  }
}

onMounted(() => {
  statistics.updateStatistics()
})
</script>

<template>
  <div class="flex gap-2 flex-col">
    <Alert
      id="config-statistics"
      description="数据并不完全准确，投递上限根据自身情况调整, 建议 120-140, boss限制最高150"
      color="warning"
      show-icon
    />
    <div
      v-if="conf.configLevel.intermediate"
      class="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7"
    >
      <div data-help="统计当天脚本扫描过的所有岗位">
        <div class="text-sm text-gray-500">岗位总数：</div>
        <div class="text-2xl font-semibold">
          {{ statistics.todayData.total }} <span class="text-sm text-gray-400">份</span>
        </div>
      </div>
      <div data-help="统计当天成功建立沟通的岗位数量">
        <div class="text-sm text-gray-500">沟通成功：</div>
        <div class="text-2xl font-semibold">
          {{ statistics.todayData.success }} <span class="text-sm text-gray-400">份</span>
        </div>
      </div>
      <div data-help="统计当天成功提交招呼消息的岗位数量">
        <div class="text-sm text-gray-500">招呼成功：</div>
        <div class="text-2xl font-semibold">
          {{ statistics.todayData.greetingSuccess }}
          <span class="text-sm text-gray-400">份</span>
        </div>
      </div>
      <div data-help="统计当天岗位过滤的比例,被过滤/总数">
        <div class="text-sm text-gray-500">过滤比例：</div>
        <div class="text-2xl font-semibold">
          {{ filterPercentage }}
          <span class="text-sm text-gray-400">%</span>
        </div>
      </div>
      <div data-help="统计当天刷到了多少处理过的岗位,重复/总数">
        <div class="text-sm text-gray-500">重复比例：</div>
        <div class="text-2xl font-semibold">
          {{ repeatPercentage }}
          <span class="text-sm text-gray-400">%</span>
        </div>
      </div>
      <div data-help="统计当天岗位中的活跃情况,不活跃/总数">
        <div class="text-sm text-gray-500">不活跃比例：</div>
        <div class="text-2xl font-semibold">
          {{ activityPercentage }}
          <span class="text-sm text-gray-400">%</span>
        </div>
      </div>
      <div :data-help="statisticCycleData[statisticCycle].help">
        <UDropdownMenu
          :items="
            statisticCycleData.map((item, index) => ({
              label: item.label,
              onSelect: () => (statisticCycle = index),
            }))
          "
        >
          <div class="text-sm text-gray-500 cursor-pointer flex items-center gap-1">
            {{ statisticCycleData[statisticCycle].label }}:
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 1024 1024">
              <path
                fill="currentColor"
                d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0 0-41.728 30.592 30.592 0 0 0-42.752 0z"
              />
            </svg>
          </div>
        </UDropdownMenu>
        <div class="text-2xl font-semibold">
          {{ cycle + statistics.todayData.success }} <span class="text-sm text-gray-400">份</span>
        </div>
        <div class="text-xs text-gray-400">
          招呼 {{ greetingCycle + statistics.todayData.greetingSuccess }} 份
        </div>
      </div>
    </div>
    <div class="flex flex-row gap-2 items-center justify-center">
      <UFieldGroup>
        <UButton
          color="primary"
          data-help="点击开始就会开始投递"
          :loading="ctx.workflow?.status.value === 'running' || ctx.preflightRunning.value"
          :disabled="ctx.simulationRunning.value"
          @click="start"
        >
          {{ ctx.workflow?.status.value === 'stop' ? '继续' : '开始' }}
        </UButton>
        <UButton
          v-if="ctx.workflow?.status.value === 'stop'"
          color="warning"
          data-help="重置已被筛选的岗位，开始将重新处理"
          @click="ctx.reset()"
        >
          重置筛选
        </UButton>
        <UButton
          v-if="ctx.workflow?.status.value === 'running'"
          color="warning"
          data-help="暂停后应该能继续"
          @click="ctx.stop()"
        >
          暂停
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-shield-check"
          :loading="ctx.preflightRunning.value"
          :disabled="ctx.workflow?.status.value === 'running' || ctx.simulationRunning.value"
          @click="runPreflight"
        >
          运行自检
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-flask-conical"
          :loading="ctx.simulationRunning.value"
          :disabled="ctx.workflow?.status.value === 'running' || ctx.preflightRunning.value"
          @click="runSimulation"
        >
          模拟筛选
        </UButton>
      </UFieldGroup>
      <UProgress
        data-help="我会统计当天脚本投递的数量,该记录并不准确"
        class="flex-1"
        :value="Number(((statistics.todayData.success / deliveryLimit) * 100).toFixed(1))"
      />
    </div>

    <UModal
      v-model:open="diagnosticsOpen"
      title="运行检查与模拟结果"
      :ui="{ content: 'sm:max-w-3xl' }"
    >
      <template #body>
        <div class="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          <section>
            <div class="mb-2 flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold">运行前自检</h3>
              <UBadge
                v-if="ctx.preflightReport.value"
                :color="ctx.preflightReport.value.ok ? 'success' : 'error'"
                variant="subtle"
              >
                {{ ctx.preflightReport.value.ok ? '通过' : '未通过' }}
              </UBadge>
            </div>
            <div v-if="ctx.preflightRunning.value" class="py-6 text-center text-sm text-muted">
              正在检查...
            </div>
            <div
              v-else-if="ctx.preflightReport.value"
              class="divide-y divide-default border-y border-default"
            >
              <div
                v-for="check in ctx.preflightReport.value.checks"
                :key="check.key"
                class="grid grid-cols-1 items-start gap-2 py-2.5 text-sm sm:grid-cols-[7rem_5rem_minmax(0,1fr)] sm:gap-3"
              >
                <span class="font-medium">{{ check.label }}</span>
                <UBadge
                  :color="preflightColors[check.status]"
                  variant="subtle"
                  class="justify-self-start"
                >
                  {{
                    check.status === 'success'
                      ? '通过'
                      : check.status === 'warning'
                        ? '提醒'
                        : '失败'
                  }}
                </UBadge>
                <span class="break-words text-muted">{{ check.message }}</span>
              </div>
            </div>
            <div v-else class="py-6 text-center text-sm text-muted">尚未运行自检</div>
          </section>

          <section v-if="ctx.simulationRunning.value || ctx.simulationResult.value">
            <h3 class="mb-2 text-sm font-semibold">模拟筛选</h3>
            <div v-if="ctx.simulationRunning.value" class="py-6 text-center text-sm text-muted">
              正在模拟筛选当前页面岗位...
            </div>
            <template v-else-if="ctx.simulationResult.value">
              <div class="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <span>总数 {{ ctx.simulationResult.value.total }}</span>
                <span class="text-success">通过 {{ ctx.simulationResult.value.passed }}</span>
                <span class="text-warning">过滤 {{ ctx.simulationResult.value.filtered }}</span>
                <span class="text-error">失败 {{ ctx.simulationResult.value.failed }}</span>
              </div>
              <div class="divide-y divide-default border-y border-default">
                <div
                  v-for="job in ctx.simulationResult.value.jobs"
                  :key="job.jobKey"
                  class="grid grid-cols-1 items-start gap-2 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1.4fr)] sm:gap-3"
                >
                  <span class="truncate" :title="job.jobName">{{ job.jobName }}</span>
                  <UBadge
                    :color="simulationColors[job.status]"
                    variant="subtle"
                    class="justify-self-start"
                  >
                    {{
                      job.status === 'passed'
                        ? '预计通过'
                        : job.status === 'filtered'
                          ? '已过滤'
                          : '检查失败'
                    }}
                  </UBadge>
                  <span class="break-words text-muted">{{ job.reason ?? '-' }}</span>
                </div>
              </div>
            </template>
          </section>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="diagnosticsOpen = false">关闭</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style lang="scss"></style>
