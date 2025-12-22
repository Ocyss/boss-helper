<script lang="ts" setup>
import {
  ElAlert,
  ElButton,
  ElButtonGroup,
  ElCol,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElIcon,
  ElMessage,
  ElProgress,
  ElRow,
  ElStatistic,
} from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useCommon } from '@/composables/useCommon'
import { useStatistics } from '@/composables/useStatistics'
import { useConf } from '@/stores/conf'
import { jobList } from '@/stores/jobs'
import { useLog } from '@/stores/log'
import { delay, notification } from '@/utils'
import { logger } from '@/utils/logger'
import { useDeliver } from '../hooks/useDeliver'
import { usePager } from '../hooks/usePager'

const log = useLog()
const statistics = useStatistics()
const common = useCommon()
const deliver = useDeliver()
const { next, page } = usePager()
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
    (date === -1 || i < date - 1) && i < statistics.statisticsData.length;
    i++
  ) {
    ans += statistics.statisticsData[i].success
  }
  return ans
})

const deliveryLimit = computed(() => {
  return conf.formData.deliveryLimit.value
})
function stopDeliver() {
  common.deliverStop = true
}
async function startBatch() {
  common.deliverLock = true
  common.deliverStop = false
  try {
    logger.debug('start batch', page)
    let oldLen = 0
    while (page.value.page <= 10 && !common.deliverStop) {
      await delay(conf.formData.delay.deliveryStarts)
      if (jobList._list.value.length === 0) {
        break
      }
      else if ((location.href.includes('/web/geek/job-recommend') || location.href.includes('/web/geek/jobs')) && oldLen === jobList._list.value.length) {
        break
      }
      oldLen = jobList._list.value.length
      await deliver.jobListHandle()
      if (common.deliverStop) {
        break
      }
      await delay(conf.formData.delay.deliveryPageNext)
      if (!next()) {
        break
      }
    }
  }
  catch (e) {
    logger.error('获取失败', e)
    ElMessage.error(`获取失败! - ${e}`)
  }
  finally {
    logger.debug('日志信息', log.data)
    if (conf.formData.notification.value) {
      await notification('投递结束')
    }
    ElMessage.info('投递结束')
    common.deliverLock = false
  }
}

function resetFilter() {
  jobList._list.value.forEach((v) => {
    switch (v.status.status) {
      case 'success':
        break
      case 'pending':
      case 'wait':
      case 'running':
      case 'error':
      case 'warn':
      default:
        v.status.setStatus('wait', '等待中')
    }
  })
}

onMounted(() => {
  statistics.updateStatistics()
})
</script>

<template>
  <ElAlert style="margin-bottom: 10px" title="数据并不完全准确，投递上限根据自身情况调整，过高的上限也许会适得其反" type="warning" />
  <ElRow :gutter="20">
    <ElCol :span="5">
      <ElStatistic
        data-help="统计当天脚本扫描过的所有岗位"
        :value="statistics.todayData.total"
        title="岗位总数："
        suffix="份"
      />
    </ElCol>
    <ElCol :span="5">
      <ElStatistic
        data-help="统计当天岗位过滤的比例,被过滤/总数"
        :value="((statistics.todayData.total - statistics.todayData.success) / statistics.todayData.total) * deliveryLimit"
        title="过滤比例："
        suffix="%"
      />
    </ElCol>
    <ElCol :span="5">
      <ElStatistic
        data-help="统计当天岗位中已沟通的比例,已沟通/总数"
        :value="(statistics.todayData.repeat / statistics.todayData.total) * deliveryLimit"
        title="沟通比例："
        suffix="%"
      />
    </ElCol>
    <ElCol :span="5">
      <ElStatistic
        data-help="统计当天岗位中的活跃情况,不活跃/总数"
        :value="(statistics.todayData.activityFilter / statistics.todayData.total) * deliveryLimit"
        title="活跃比例："
        suffix="%"
      />
    </ElCol>
    <ElCol :span="4">
      <ElStatistic
        :data-help="statisticCycleData[statisticCycle].help"
        :value="cycle + statistics.todayData.success"
        suffix="份"
      >
        <template #title>
          <ElDropdown
            trigger="click"
            @command="
              (arg) => {
                statisticCycle = arg;
              }
            "
          >
            <span class="el-dropdown-link">
              {{ statisticCycleData[statisticCycle].label }}:
              <ElIcon class="el-icon--right">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
                  <path
                    fill="currentColor"
                    d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0 0-41.728 30.592 30.592 0 0 0-42.752 0z"
                  />
                </svg>
              </ElIcon>
            </span>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem
                  v-for="(item, index) in statisticCycleData"
                  :key="index"
                  :command="index"
                >
                  {{ item.label }}
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </template>
      </ElStatistic>
    </ElCol>
  </ElRow>
  <div style="display: flex">
    <ElButtonGroup style="margin: 10px 30px 0 0">
      <ElButton
        type="primary"
        data-help="点击开始就会开始投递"
        :loading="common.deliverLock"
        @click="startBatch"
      >
        开始
      </ElButton>
      <ElButton
        v-if="!common.deliverLock && common.deliverStop"
        type="warning"
        data-help="重置已被筛选的岗位，开始将重新处理"
        @click="resetFilter"
      >
        重置筛选
      </ElButton>
      <ElButton
        v-if="common.deliverLock && !common.deliverStop"
        type="warning"
        data-help="暂停后应该能继续"
        @click="stopDeliver()"
      >
        暂停
      </ElButton>
    </ElButtonGroup>
    <ElProgress
      data-help="我会统计当天脚本投递的数量,该记录并不准确"
      style="flex: 1"
      :percentage="Number(((statistics.todayData.success / deliveryLimit) * 100).toFixed(1))"
    />
  </div>
</template>

<style lang="scss"></style>
