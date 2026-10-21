<script lang="ts" setup>
import { useElementBounding, useWindowSize } from '@vueuse/core'
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'

import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'
import type { JobData } from '@/composables/useHelper'
import { counter } from '@/message'
import { delay } from '@/utils'
import { jsonClone } from '@/utils/deepmerge'
import elmGetter from '@/utils/elmGetter'
import { logger } from '@/utils/logger'

const promptTestJobsKey = 'local:prompt-test-jobs'

const toast = useToast()
const helper = useHelper()
const conf = useConf()
const savingJobs = ref(false)

async function saveJobs() {
  if (savingJobs.value) return
  if (
    !window.confirm(
      '将提取当前页面已加载的岗位（最多20个）。为了拿到完整岗位数据会逐个发起请求，并按配置中的「投递间隔」进行等待，开销较大、耗时较久，请耐心等待。保存会覆盖旧的测试岗位数据，请勿重复点击。是否继续？',
    )
  ) {
    return
  }
  savingJobs.value = true
  try {
    const jobs: JobData[] = []
    const list = helper.jobList.value.slice(0, 20)
    for (const item of list) {
      try {
        await helper.onJobCardClick(item.key) // 触发加载完整数据
        const data = helper.jobMaps.get(item.key)
        jobs.push(jsonClone(data?.jobData ?? item))
      } catch (err) {
        logger.error('SaveTestJobError', err)
        jobs.push(jsonClone(item))
      }
      await delay(conf.formData.delayDeliveryInterval)
    }
    await counter.storageSet(promptTestJobsKey, jobs)
    toast.add({
      title: `已保存 ${jobs.length} 个岗位数据，可在配置页提示词测试中使用`,
      color: 'success',
    })
  } finally {
    savingJobs.value = false
  }
}

const CONTAINER_ID = 'boss-helper-external-wrapper'
const placeholder = ref<HTMLElement | null>(null)
const externalWrapper = ref<HTMLElement | null>(null)

const { x, y, width, height } = useElementBounding(placeholder)
const { width: windowWidth } = useWindowSize()

watch([x, y, width, windowWidth], () => {
  if (!externalWrapper.value) return
  if (height.value === 0 && y.value === 0) {
    externalWrapper.value.style.display = 'none'
    return
  }
  Object.assign(externalWrapper.value.style, {
    display: 'flex',
    position: 'fixed',
    zIndex: '100',
    left: `${x.value}px`,
    top: `${y.value}px`,
    width: `${width.value}px`,
    pointerEvents: 'auto',
  })
})

const { height: externalHeight } = useElementBounding(externalWrapper)
const internalHeight = ref(0)
watch(externalHeight, (newVal) => {
  internalHeight.value = newVal
})

async function initExternalContainer() {
  let wrapper = document.getElementById(CONTAINER_ID)
  if (!wrapper) {
    wrapper = document.createElement('div')
    wrapper.id = CONTAINER_ID
    wrapper.style.cssText = `
    flex-direction: column;
    gap: 10px;
    `
    document.body.appendChild(wrapper)
  }
  externalWrapper.value = wrapper
  return wrapper
}

async function collectTargets() {
  let targets: HTMLElement[] = []
  const url = location.href
  const excludeNot = `:not(#${CONTAINER_ID} *)`

  if (url.includes('/web/geek/job-recommend')) {
    const el = await elmGetter.get<HTMLElement>(`.job-recommend-search${excludeNot}`)
    if (el) targets = [el]
  } else if (url.includes('/web/geek/jobs')) {
    const [search, condition] = await elmGetter.get<HTMLElement>([
      `.page-jobs-main .expect-and-search${excludeNot}`,
      `.page-jobs-main .filter-condition${excludeNot}`,
    ])
    if (search && condition) targets = [search, condition]
  } else {
    const [search, condition] = await elmGetter.get<HTMLElement>([
      `.job-search-wrapper .job-search-box${excludeNot}`,
      `.job-search-wrapper .search-condition-wrapper${excludeNot}`,
    ])
    if (search && condition) targets = [search, condition]
  }
  return targets
}

onMounted(async () => {
  const wrapper = await initExternalContainer()
  const targets = await collectTargets()

  if (targets.length) {
    wrapper.innerHTML = ''
    targets.forEach((el) => {
      el.style.setProperty('margin', '0', 'important')
      el.style.setProperty('width', '100%', 'important')
      wrapper.appendChild(el)
    })
  }

  wrapper.style.display = 'flex'

  nextTick(() => {
    window.dispatchEvent(new Event('resize'))
  })
})

onUnmounted(() => {
  if (externalWrapper.value) {
    externalWrapper.value.style.display = 'none'
  }
})
</script>

<template>
  <Alert
    description="此处为Boss原生筛选条件, 如果不生效跟插件无关,
  也无法进行功能优化, 遇到样式错误才可反馈"
    color="warning"
    show-icon
    :actions="[
      {
        label: savingJobs ? '正在保存岗位数据...' : '存储岗位数据(最大20个)',
        color: 'neutral',
        variant: 'subtle',
        loading: savingJobs,
        disabled: savingJobs,
        onClick: saveJobs,
      },
    ]"
  />
  <div
    ref="placeholder"
    class="w-full invisible pointer-events-none mt-4"
    :style="{ height: `${internalHeight}px` }"
  />
</template>
