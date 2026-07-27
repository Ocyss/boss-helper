<script lang="ts" setup>
import { useElementBounding, useWindowSize } from '@vueuse/core'
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'

import elmGetter from '@/utils/elmGetter'

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
    id="tabs-filter"
    description="此处为Boss原生筛选条件, 如果不生效跟插件无关, 也无法进行功能优化, 遇到样式错误才可反馈"
    color="warning"
    show-icon
  />
  <div
    ref="placeholder"
    class="w-full invisible pointer-events-none"
    :style="{ height: `${internalHeight}px` }"
  />
</template>
