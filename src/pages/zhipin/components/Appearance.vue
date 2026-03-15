<script lang="ts" setup>
import { useFavicon, useStorageAsync, useTitle } from '@vueuse/core'
import { ElCheckbox } from 'element-plus'
import { watch, watchEffect } from 'vue'

import Alert from '@/components/Alert'
import { useStatistics } from '@/composables/useStatistics'
import { ExtStorage } from '@/message'
import { useConf } from '@/stores/conf'

const title = useTitle(undefined, { observe: true })
const { todayData } = useStatistics()
const { formData } = useConf()

const conf = useStorageAsync(
  'appearance-conf',
  {
    hideHeader: false,
    changeIcon: false,
    dynamicTitle: false,
    changeBackground: false,
    blurCard: false,
    listSink: false,
  },
  ExtStorage,
  { mergeDefaults: true },
)

watch(
  () => conf.value.changeIcon,
  (v) => {
    if (!v) {
      return
    }
    const icon = useFavicon()
    icon.value = 'https://onlinecalculator.cc/public/favicon.svg'
  },
)

watch(
  () => conf.value.hideHeader,
  (val) => {
    const h = document.getElementById('header')
    if (!h) return
    h.style.display = val ? 'none' : ''
  },
)

let dynamicTitle: ReturnType<typeof watchEffect> | null = null

watch(
  () => conf.value.dynamicTitle,
  (val) => {
    if (!val) {
      dynamicTitle?.stop()
    } else {
      dynamicTitle = watchEffect(() => {
        title.value = `${todayData.success}/${formData.deliveryLimit.value} - 在线计算器`
      })
    }
  },
)

let ticking = false

watch(
  () => conf.value.blurCard,
  (val) => {
    const card = document.querySelector<HTMLDivElement>('.boss-helper-card')
    const blur = card?.querySelector<HTMLDivElement>('.card-grid-overlay')
    if (!blur || !card) return
    if (!val) {
      blur.style.display = 'none'
      card.onmousemove = null
      card.onmouseleave = null
    } else {
      blur.style.display = 'unset'
      card.onmousemove = (e) => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            const rect = card.getBoundingClientRect()
            card.style.setProperty('--x', `${e.clientX - rect.left}px`)
            card.style.setProperty('--y', `${e.clientY - rect.top}px`)
            card.style.setProperty('--r', '120px')
            ticking = false
          })
          ticking = true
        }
        card.onmouseleave = () => {
          card.style.setProperty('--r', '0px')
        }
      }
    }
  },
)

watch(
  () => conf.value.listSink,
  (val) => {
    const h = document.getElementById('boss-helper-job-warp')
    if (!h) return
    h.style.marginBottom = val ? '300px' : 'unset'
  },
)
</script>

<template>
  <div>
    <Alert
      id="appearance-alert-1"
      style="margin-bottom: 10px"
      type="success"
      description="此处提供一些便捷的外观调整功能。目前出于开发阶段, 暂无帮助文档，自行探索. 自动保存"
    />
    <ElCheckbox v-model="conf.hideHeader" label="隐藏头" border />
    <ElCheckbox v-model="conf.changeIcon" label="更换图标" border />
    <ElCheckbox v-model="conf.dynamicTitle" label="动态标题" border />
    <ElCheckbox v-model="conf.blurCard" label="模糊卡片" border />
    <ElCheckbox v-model="conf.listSink" label="列表下沉" border />
  </div>
</template>

<style lang="scss" scoped></style>
