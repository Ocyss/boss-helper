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

const deliveryLimit = computed(() => {
  return conf.formData.deliveryLimit.value
})

// 分母为零时返回 0，避免初始状态展示 NaN/Infinity。
const safeRate = (value: number, total: number) =>
  total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '—'

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
    <div v-if="conf.configLevel.intermediate" class="grid grid-cols-5 gap-4">
      <div data-help="统计当天脚本扫描过的所有岗位">
        <div class="text-sm text-gray-500">岗位总数：</div>
        <div class="text-2xl font-semibold">
          {{ statistics.todayData.total }} <span class="text-sm text-gray-400">份</span>
        </div>
      </div>
      <div data-help="统计当天岗位过滤的比例,被过滤/总数">
        <div class="text-sm text-gray-500">过滤比例：</div>
        <div class="text-2xl font-semibold">
          {{
            safeRate(
              statistics.todayData.filtered ??
                statistics.todayData.total - statistics.todayData.success,
              statistics.todayData.total,
            )
          }}
        </div>
      </div>
      <div data-help="统计当天刷到了多少处理过的岗位,重复/总数">
        <div class="text-sm text-gray-500">重复比例：</div>
        <div class="text-2xl font-semibold">
          {{ safeRate(statistics.todayData.repeat, statistics.todayData.total) }}
        </div>
      </div>
      <div data-help="统计当天岗位中的活跃情况,不活跃/总数">
        <div class="text-sm text-gray-500">活跃比例：</div>
        <div class="text-2xl font-semibold">
          {{ safeRate(statistics.todayData.activityFilter, statistics.todayData.total) }}
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
      </div>
    </div>
    <div class="flex flex-row gap-2 items-center justify-center">
      <UFieldGroup>
        <UButton
          color="primary"
          data-help="点击开始就会开始投递"
          :loading="ctx.workflow?.status.value === 'running'"
          @click="ctx.start()"
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
      </UFieldGroup>
      <UProgress
        data-help="我会统计当天脚本投递的数量,该记录并不准确"
        class="flex-1"
        :value="
          deliveryLimit > 0
            ? Number(((statistics.todayData.success / deliveryLimit) * 100).toFixed(1))
            : 0
        "
      />
    </div>
  </div>
</template>

<style lang="scss"></style>
