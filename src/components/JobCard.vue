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

const stateMaps: Record<JobStatus, { color: string; icon: string; label: string }> = {
  pending: { color: '#CECECE', icon: '', label: '' },
  wait: { color: '#CECECE', icon: 'i-lucide-clock', label: '等待' },
  error: { color: '#e74c3c', icon: 'i-lucide-x', label: '失败' },
  warn: { color: '#f39c12', icon: 'i-lucide-triangle-alert', label: '已过滤' },
  success: { color: '#2ecc71', icon: 'i-lucide-check', label: '成功' },
  running: { color: '#98F5F9', icon: 'i-line-md-loading-twotone-loop', label: '运行中' },
  request: { color: '#3498db', icon: 'i-svg-spinners-wifi-fade', label: '请求中' },
  ai: { color: '#9b59b6', icon: 'i-line-md-hazard-lights-loop', label: 'AI' },
}

function isCompactHint(text?: string) {
  if (!text) return false
  const t = text.replace(/（缓存）/g, '').trim()
  return t.length > 0 && t.length <= 8 && !/[,，\n]/.test(t)
}

const jobStatus = computed(() => {
  const result = jobResult.value
  const status = result?.status ?? 'pending'
  const meta = stateMaps[status]
  const compact = [result?.id, result?.msg].find(isCompactHint)
  const label = compact ?? meta.label
  const suffix = result?.isCache && !label.includes('缓存') ? '·缓存' : ''
  return {
    status,
    color: meta.color,
    icon: meta.icon,
    label: `${label}${suffix}`,
    title: result?.reason || result?.msg || label,
    show: status !== 'pending' ? 'flex' : 'none',
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
    class="job-card"
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
      class="card-status flex-row gap-1.5 justify-center items-center"
      v-if="jobResult && jobStatus.status !== 'pending'"
      :title="jobStatus.title"
    >
      <UIcon v-if="jobStatus.icon" :name="jobStatus.icon" class="size-3.5 shrink-0" />
      <span class="card-status-label">{{ jobStatus.label }}</span>
    </div>
  </div>
</template>
