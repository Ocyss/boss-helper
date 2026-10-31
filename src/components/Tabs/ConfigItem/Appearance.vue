<script lang="ts" setup>
import { useFavicon, useStorageAsync, useTitle } from '@vueuse/core'
import { watch, watchEffect } from 'vue'

import Alert from '@/components/Alert.vue'
import { useConf, appearanceConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

const title = useTitle(undefined, { observe: true })
const helper = useHelper()
const { todayData } = helper.statistics
const { formData } = useConf()
const ctx = useHelper()
watch(
  () => appearanceConf.value.changeIcon,
  (v) => {
    if (!v) {
      return
    }
    const icon = useFavicon()
    icon.value = 'https://onlinecalculator.cc/public/favicon.svg'
  },
  {
    immediate: true,
  },
)

watch(
  () => appearanceConf.value.hideHeader,
  (val) => {
    const h = document.getElementById('header')
    if (!h) return
    h.style.display = val ? 'none' : ''
  },
  {
    immediate: true,
  },
)

watch(
  () => appearanceConf.value.chatBoxWidth,
  (val) => {
    const h = ctx.shadowRoot?.querySelector<HTMLDivElement>('div.boss-chat-box')
    if (!h) return
    h.style.width = val + 'px'
  },
  {
    immediate: true,
  },
)

let dynamicTitle: ReturnType<typeof watchEffect> | null = null

watch(
  () => appearanceConf.value.dynamicTitle,
  (val) => {
    if (!val) {
      dynamicTitle?.stop()
    } else {
      dynamicTitle = watchEffect(() => {
        title.value = `${todayData.value.success}/${formData.deliveryLimit.value} - 在线计算器`
      })
    }
  },
  {
    immediate: true,
  },
)

let ticking = false

watch(
  () => appearanceConf.value.blurCard,
  (val) => {
    const root = document.querySelector('boss-helper-job')?.shadowRoot
    if (!root) return
    const card = root.querySelector<HTMLDivElement>('.boss-helper-card')
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
  {
    immediate: true,
  },
)

watch(
  () => appearanceConf.value.listSink,
  (val) => {
    const h = ctx.shadowRoot?.getElementById('app-root')
    if (!h) return
    h.style.marginBottom = val ? '300px' : 'unset'
  },
  {
    immediate: true,
  },
)
</script>

<template>
  <div class="flex flex-col gap-2" data-help="外观配置, 自行体会">
    <div class="flex flex-row flex-wrap gap-4">
      <Alert
        id="appearance-alert-1"
        style="margin-bottom: 10px"
        type="success"
        description="此处提供一些便捷的外观调整功能。目前出于开发阶段, 暂无帮助文档，自行探索. 自动保存"
      />
      <UCheckbox v-model="appearanceConf.hideHeader" label="隐藏头" />
      <UCheckbox v-model="appearanceConf.changeIcon" label="更换图标" />
      <UCheckbox v-model="appearanceConf.dynamicTitle" label="动态标题" />
      <UCheckbox v-model="appearanceConf.blurCard" label="模糊卡片" />
      <UCheckbox v-model="appearanceConf.listSink" label="列表下沉" />
      <UCheckbox v-model="appearanceConf.leftChat" label="左侧聊天" />
      <UCheckbox v-model="appearanceConf.defaultShowChatBox" label="默认显示聊天框" />
    </div>
    <UFormField label="岗位展示">
      <USelect
        v-model="appearanceConf.jobView"
        :items="[
          { label: '横向卡片', value: 'cards' },
          { label: '虚拟化表格', value: 'table' },
        ]"
        class="w-full"
      />
    </UFormField>
    <UFormField v-if="appearanceConf.jobView === 'table'" label="表格高度（×10px）">
      <UInputNumber
        v-model="appearanceConf.tableHeight"
        :step="1"
        :min="30"
        :max="500"
        size="sm"
        class="w-full"
      />
    </UFormField>
    <UFormField label="内容宽度（px）">
      <UInputNumber
        v-model="appearanceConf.contentWidth"
        :step="10"
        :min="600"
        :max="5000"
        size="sm"
        class="w-full"
      />
    </UFormField>
    <UFormField label="内容偏移">
      <UInputNumber
        v-model="appearanceConf.contentOffset"
        :step="0.5"
        :min="0"
        :max="30"
        size="sm"
        class="w-full"
      />
    </UFormField>
    <UFormField label="聊天框宽度">
      <UInputNumber
        v-model="appearanceConf.chatBoxWidth"
        :step="10"
        :min="200"
        :max="1500"
        size="sm"
        class="w-full"
      />
    </UFormField>
  </div>
</template>
