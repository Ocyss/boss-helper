<script setup lang="ts">
import type { MyJobListData } from '@/stores/jobs'
import { ElSpace, ElTag } from 'element-plus'
import { ref } from 'vue'

const props = defineProps<{
  job: MyJobListData
  hover?: boolean
}>()

const showDescription = ref(false)
function stateColor(state?: string): string {
  switch (state) {
    case 'pending':
      return '#CECECE'
    case 'wait':
      return '#CECECE'
    case 'error':
      return '#e74c3c'
    case 'warn':
      return '#f39c12'
    case 'success':
      return '#2ecc71'
    case 'running':
      return '#98F5F9'
  }
  return '#CECECE'
}

async function showDescriptionHandler() {
  showDescription.value = true
  if (props.job.card == null) {
    await props.job.getCard()
  }
}

function getActiveTimeType(activeTime?: number): 'success' | 'warning' | 'danger' {
  if (!activeTime)
    return 'danger'

  const now = Date.now()
  const diffDays = (now - activeTime) / (1000 * 60 * 60 * 24)

  if (diffDays <= 2)
    return 'success'
  if (diffDays <= 7)
    return 'warning'
  return 'danger'
}
</script>

<template>
  <div
    class="job-card"
    :class="{ 'job-card-hover': hover }"
    :style="{
      '--state-color': stateColor(job.status.status),
      '--state-show': job.status.status !== 'pending' ? 'block' : 'none',
    }"
  >
    <div class="card-tag">
      {{ job.brandIndustry }},{{ job.jobDegree }},{{ job.brandScaleName }}
    </div>
    <a :href="`https://www.zhipin.com/job_detail/${job.encryptJobId}.html`" target="_blank" class="card-title">
      {{ job.jobName }}
    </a>
    <h3 class="card-salary">
      {{ job.salaryDesc }}
    </h3>
    <div v-show="showDescription" class="card-content" :title="job.card?.postDescription" @click="showDescription = false">
      {{ job.card?.postDescription }}
    </div>
    <div v-show="!showDescription" class="card-content" @click="showDescriptionHandler">
      <div>
        <ElSpace :size="3" wrap>
          <ElTag
            v-for="tag in job.skills"
            :key="tag"
            size="small"
            effect="plain"
            type="warning"
          >
            {{ tag }}
          </ElTag>
          <ElTag
            v-for="tag in job.jobLabels"
            :key="tag"
            size="small"
            effect="plain"
            type="success"
          >
            {{ tag }}
          </ElTag>
        </ElSpace>
      </div>
      <div class="card-footer">
        {{ job.welfareList.join(",") }}
      </div>
    </div>

    <div v-if="job.card?.brandComInfo?.activeTime" class="active-time-tag">
      <ElTag
        :type="getActiveTimeType(job.card.brandComInfo.activeTime)"
        effect="plain"
      >
        活跃时间：{{ new Date(job.card?.brandComInfo.activeTime).toLocaleString() }}
      </ElTag>
    </div>

    <div class="author-row">
      <img
        alt=""
        class="avatar"
        height="80"
        :src="job.brandLogo"
        width="80"
      >
      <div>
        <span class="company-name">{{ job.brandName }}</span>
        <h4>
          {{ job.cityName }}/{{ job.areaDistrict }}/{{ job.businessDistrict }}
        </h4>
      </div>
    </div>
    <div class="card-status">
      {{ job.status.msg || '无内容' }}
    </div>
  </div>
</template>

<style scoped>
.job-card {
  --state-color: #f00;
  --state-show: block;

  padding: 1.5rem;
  border-radius: 16px;
  background: linear-gradient(85deg, #f2eeee, #eff0f6);
  color: #000;
  display: flex;
  flex-direction: column;
  transition: 0.2s;
  margin: 0;
  position: relative;
  min-width: 300px;
  max-width: 360px;
  min-height: 28rem;
  max-height: 32rem;
  box-shadow: -2rem 0 1rem -2rem #cdb9b9;

  * {
    user-select: none;
  }
  .card-status {
    position: absolute;
    display: var(--state-show);
    border-radius: 30px;
    border-bottom-left-radius: 0;
    border-top-left-radius: 0;
    background-color: var(--state-color);
    color: #fff;
    padding: 7px 17px;
    text-wrap: nowrap;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 5px;
    left: -6px;
    bottom: -14px;
    transition: all 0.25s ease;
    box-shadow: 1px -7px 12px -2px rgb(167 167 167 / 40%);
  }
  &::after {
    position: absolute;
    content: "";
    display: var(--state-show);
    left: -6px;
    bottom: 18px;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 0px solid transparent;
    border-bottom: 10px solid oklch(from var(--state-color) calc(l * 0.75) c h);
  }
  .card-tag {
    display: block;
    margin: 0 0 0.25rem;
    color: #6a6868;
    font-size: 0.7rem;
  }
  .card-title {
    font-size: 1.2rem;
    margin: 0 0 8px;
    &:hover {
      color: #409eff;
    }
  }
  .card-salary {
    font-size: 1.1rem;
    margin: 0 0 1rem;
    color: #ff442e;
  }
  .card-footer {
    -webkit-margin-before: auto;
    margin-block-start: auto;
    padding: 5px 0;
  }
  .active-time-tag {
    padding: 0.5rem 0;
    display: flex;
    justify-content: flex-start;
  }
  .card-content {
    cursor: pointer;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    margin-right: 0.5rem;
  }
  .author-row {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 0.5rem;
    align-items: center;
    color: #a09f9f;
    line-height: 1.3;
    padding-top: 0.5rem;
    .company-name {
      color: #000;
    }
  }

  &:focus-within,
  &.job-card-hover:hover {
    transform: translateY(-1rem) rotate(3deg);
  }

  &:focus-within ~ &,
  &.job-card-hover:hover ~ & {
    transform: translateX(130px);
  }

  &:first-child:focus-within,
  &:first-child.job-card-hover:hover {
    transform: translate(-0.5rem, -1rem) rotate(3deg);
  }

  &:not(:first-child) {
    margin-left: -130px;
    box-shadow: -3rem 0 3rem -3rem #b4adad;
  }

  @media (max-width: 1200px) {
    & {
      min-width: 250px;
    }

    &:not(:first-child) {
      margin-left: -30px;
    }

    &.job-card-hover:hover {
      transform: translateY(-1rem);
    }

    &.job-card-hover:hover ~ & {
      transform: translateX(30px);
    }
  }
}

html.dark {
  .job-card {
    background: linear-gradient(85deg, #434343, #262626);
    color: #fff;
    box-shadow: -2rem 0 1rem -2rem #000;
    .card-title {
      color: #fff;
      &:hover {
        color: #409eff;
      }
    }
    .card-status {
      color: #fff;

      box-shadow: 1px -7px 12px -2px rgb(167 167 167 / 40%);
    }

    .card-tag {
      color: #b4b4b4;
    }

    .card-salary {
      color: #ff442e;
    }

    .author-row {
      color: #a09f9f;

      .company-name {
        color: #fff;
      }
    }

    &:not(:first-child) {
      box-shadow: -3rem 0 3rem -3rem #000;
    }
  }
}
</style>
