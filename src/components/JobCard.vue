<script setup lang="ts">
import { ref } from 'vue'

import { JobStatus } from '@/composables/useApplying/type'
import { JobData, useHelper } from '@/composables/useHelper'

const helper = useHelper()

const props = defineProps<{
  job: JobData
  hover?: boolean
}>()

const jobResult = computed(() => {
  return helper.jobResultMaps.get(props.job.key)
})

const stateMaps: Record<JobStatus, string> = {
  pending: '#CECECE',
  wait: '#CECECE',
  error: '#e74c3c',
  warn: '#f39c12',
  success: '#2ecc71',
  running: '#98F5F9',
  request: '#3498db',
  ai: '#9b59b6',
}

const jobStatus = computed(() => {
  const status = jobResult.value?.status ?? 'pending'
  const data = stateMaps[status]
  return {
    status,
    color: data,
    show: jobResult.value?.status !== 'pending' ? 'flex' : 'none',
  }
})

const showDescription = ref(false)
const showDescriptionLoading = ref(false)
const showDescriptionMessage = ref<string | null>(null)

async function showDescriptionHandler() {
  showDescription.value = true
  showDescriptionLoading.value = true
  showDescriptionMessage.value = null
  try {
    await helper.onJobCardClick(props.job.key)
  } catch (e) {
    console.error('showDescriptionHandler error', e)
    showDescriptionMessage.value = e instanceof Error ? e.message : String(e)
  } finally {
    showDescriptionLoading.value = false
  }
}

function getActiveTimeType(job: JobData): 'success' | 'warning' | 'error' {
  const activeTime = job.activeTime
  if (!activeTime) return 'error'

  const now = Date.now()
  const diffDays = (now - activeTime) / (1000 * 60 * 60 * 24)

  if (diffDays <= 2) return 'success'
  if (diffDays <= 7) return 'warning'
  return 'error'
}
</script>

<template>
  <div
    class="job-card job-list-row"
    :class="{ 'job-card-hover': hover }"
    :style="{
      '--state-color': jobStatus.color,
      '--state-show': jobStatus.show,
    }"
    v-if="job"
  >
    <div class="card-tag">{{ job.brand.industry }},{{ job.degreeName }},{{ job.brand.scale }}</div>
    <!-- `https://www.zhipin.com/job_detail/${job.encryptJobId}.html`" -->
    <a :href="job.link" target="_blank" class="card-title">
      {{ job.jobName }}
    </a>
    <h3 class="card-salary">
      {{ job.salary }}
    </h3>
    <!-- 列表行补充 AI 分数、阶段和错误原因，字段缺失时安全降级。 -->
    <div class="job-meta-row">
      <span>AI {{ jobResult?.aiScore ?? '—' }}</span>
      <span>阶段：{{ jobResult?.id || '未开始' }}</span>
      <span v-if="jobResult?.updatedAt"
        >时间：{{ new Date(jobResult.updatedAt).toLocaleTimeString('zh-CN') }}</span
      >
      <span v-if="jobResult?.reason">原因：{{ jobResult.reason }}</span>
      <span v-else-if="jobResult?.status === 'error' || jobResult?.status === 'warn'"
        >原因：{{ jobResult.msg || '任务未通过' }}</span
      >
    </div>
    <div
      v-if="jobResult?.draft"
      class="job-draft"
      :title="
        helper.conf.formData.autoDelivery.value
          ? '自动投递模式：文本招呼语已发送'
          : '仅为草稿，不会自动发送'
      "
    >
      {{ helper.conf.formData.autoDelivery.value ? '招呼语：' : '招呼草稿：' }}{{ jobResult.draft }}
    </div>
    <div
      v-show="showDescription"
      class="card-content"
      :title="job.jobDescription"
      @click="showDescription = false"
    >
      <template v-if="showDescriptionLoading">
        加载中...
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-4/5" />
      </template>
      <template v-else-if="showDescriptionMessage">
        {{ showDescriptionMessage }}
      </template>
      <template v-else>
        {{ job.jobDescription }}
      </template>
    </div>
    <div v-show="!showDescription" class="card-content" @click="showDescriptionHandler">
      <div>
        <div class="flex flex-wrap gap-1">
          <UBadge v-for="tag in job.skills" :key="tag" size="sm" variant="subtle" color="warning">
            {{ tag }}
          </UBadge>
          <UBadge
            v-for="tag in job.jobLabels"
            :key="tag"
            size="sm"
            variant="subtle"
            color="success"
          >
            {{ tag }}
          </UBadge>
        </div>
      </div>
      <div class="card-footer" v-if="job.welfareList && job.welfareList.length > 0">
        {{ job.welfareList.join(',') }}
      </div>
    </div>

    <div v-if="job.activeTime || job.activeTimeStr" class="active-time-tag">
      <UBadge :color="getActiveTimeType(job)" variant="subtle">
        活跃时间：{{
          job.activeTime
            ? `${new Date(job.activeTime).toLocaleString('zh')}${job.activeTimeStr ? ` (${job.activeTimeStr})` : ''}`
            : job.activeTimeStr
        }}
      </UBadge>
    </div>

    <div class="author-row">
      <img alt="" class="avatar" height="80" :src="job.brand.logo" width="80" />
      <div>
        <span class="company-name">{{ job.brand.name }}</span>
        <!-- <h4>{{ job.cityName }}/{{ job.areaDistrict }}/{{ job.businessDistrict }}</h4> -->
        <h4>{{ job.address }}</h4>
      </div>
    </div>
    <div
      class="card-status flex-row gap-2 justify-center items-center"
      v-if="jobResult"
      :title="jobResult?.reason || jobResult?.msg"
    >
      <UIcon v-if="jobStatus.status === 'running'" name="i-line-md-loading-twotone-loop" />
      <UIcon v-else-if="jobStatus.status === 'request'" name="i-svg-spinners-wifi-fade" />
      <UIcon v-else-if="jobStatus.status === 'ai'" name="i-line-md-hazard-lights-loop" />
      {{ jobResult?.msg || jobResult?.reason || '无内容' }}
    </div>
  </div>
</template>
