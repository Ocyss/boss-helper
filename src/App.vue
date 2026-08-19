<script lang="ts" setup>
import type { TabsItem } from '@nuxt/ui'
import { useRafFn } from '@vueuse/core'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'

import ChatBox from '@/components/ChatBox.vue'
import JobCards from '@/components/JobCards.vue'
import Version from '@/components/Menu/Version.vue'
import About from '@/components/Tabs/About.vue'
import Ai from '@/components/Tabs/AI.vue'
import Config from '@/components/Tabs/Config.vue'
import Filter from '@/components/Tabs/Filter.vue'
import Logs from '@/components/Tabs/Logs.vue'
import Statistics from '@/components/Tabs/Statistics.vue'
import { useConf, appearanceConf } from '@/composables/conf'
import { useModel } from '@/composables/useModel'

import { useHelper, VITE_VERSION } from './composables/useHelper'

const model = useModel()

const helper = useHelper()
const { todayData } = helper.statistics
const conf = useConf()

const items = computed<TabsItem[]>(() => {
  const configs = [
    { slot: 'statistics', label: '统计', help: '失败是成功她妈' },
    { slot: 'filter', label: '筛选' },
    { slot: 'config', label: '配置', help: '好好看，好好学' },
    { slot: 'ai', label: 'AI', help: 'AI时代，脚本怎么能落伍!' },
    { slot: 'logs', label: '日志', help: '反正你也不看' },
    { slot: 'about', label: '关于&赞赏', help: '项目是写不完美的,但总要去追求完美' },
  ] satisfies (TabsItem | boolean | null | undefined | '')[]

  return configs.filter((item) => !!item) as TabsItem[]
})

// const externalFilter = ref<HTMLElement>()
const container = ref<HTMLElement>()
const isFeatureEnabled = ref(false)
const helpContent = ref('鼠标移到对应元素查看提示')
const anchor = ref({ x: 0, y: 0 })
const isHovering = ref(false)
const helpVisible = computed(() => isFeatureEnabled.value && isHovering.value)
let lastElement: HTMLElement | null = null
let lastRect = { left: 0, top: 0, width: 0, height: 0 }
let root: ShadowRoot | Document = document
const boxStyles = shallowRef({
  display: 'none',
  width: '0px',
  height: '0px',
  transform: 'translate(0, 0)',
})

watch(helpVisible, (visible) => {
  if (visible) {
    resume()
  } else {
    pause()
    lastElement = null
    boxStyles.value = { ...boxStyles.value, display: 'none' }
  }
})

const reference = computed(() => ({
  getBoundingClientRect: () =>
    ({
      width: 0,
      height: 0,
      left: anchor.value.x,
      right: anchor.value.x,
      top: anchor.value.y,
      bottom: anchor.value.y,
    }) as DOMRect,
}))

const updateOverlay = () => {
  const target = root.elementFromPoint(anchor.value.x, anchor.value.y) as HTMLElement | null
  const el = target?.closest('[data-help]') as HTMLElement | null
  const help = el?.dataset.help || ''
  if (!el || help === 'no-help') {
    if (boxStyles.value.display !== 'none') {
      boxStyles.value = { ...boxStyles.value, display: 'none' }
      lastElement = null
    }
    return
  }

  const rect = el.getBoundingClientRect()
  const hasMoved =
    Math.abs(rect.left - lastRect.left) > 0.5 ||
    Math.abs(rect.top - lastRect.top) > 0.5 ||
    rect.width !== lastRect.width

  if (el === lastElement && !hasMoved) return

  lastElement = el
  lastRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  helpContent.value = help

  boxStyles.value = {
    display: 'block',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: `translate(${rect.left}px, ${rect.top}px)`,
  }
}

const { pause, resume } = useRafFn(updateOverlay, { immediate: false })

const chatOpen = ref(appearanceConf.value.defaultShowChatBox)

onMounted(() => {
  root = (container.value?.getRootNode() as ShadowRoot) ?? document
  void conf.confInit()
  void model.initModel()
  void helper.tokenUsage.load()
  chatOpen.value = appearanceConf.value.defaultShowChatBox
})

function tagOpen(url: string) {
  window.open(url)
}

const isDot = computed(() => {
  return (helper.netConf.value?.version ?? '0') > VITE_VERSION
})

const overlay = useOverlay()

function openStore() {
  overlay
    .create(Version, {
      destroyOnClose: true,
    })
    .open()
}

function onPointerMove(ev: PointerEvent) {
  if (!helpVisible.value) {
    return
  }
  anchor.value.x = ev.clientX
  anchor.value.y = ev.clientY
}
</script>

<template>
  <div
    class="shadow-wrapper w-284 max-w-284 min-w-284 m-10 mx-auto mb-24"
    :style="{
      marginRight:
        appearanceConf.leftChat && appearanceConf.contentOffset != 25
          ? `${appearanceConf.contentOffset}%`
          : undefined,
      marginLeft:
        !appearanceConf.leftChat && appearanceConf.contentOffset != 25
          ? `${appearanceConf.contentOffset}%`
          : undefined,
    }"
    ref="container"
  >
    <UApp :portal="container" :toaster="{ position: 'top-right', ui: { viewport: 'z-100000' } }">
      <div class="overlay-box" :style="boxStyles" />
      <UTooltip
        :open="helpVisible"
        :reference="reference"
        :content="{
          side: 'top',
          sideOffset: 20,
          updatePositionStrategy: 'always',
        }"
        :text="helpContent"
        :ui="{
          content:
            'z-1000 flex items-center gap-1 bg-default text-highlighte shadow-xl rounded-md ring-1 ring-default h-auto px-3 py-2 text-[17px] leading-snug select-none pointer-events-auto backdrop-blur-none opacity-100 wrap-break-word',
          text: 'whitespace-normal',
        }"
      />
      <div
        @pointermove.passive="onPointerMove"
        @mouseenter="isHovering = true"
        @mouseleave="isHovering = false"
      >
        <div class="rounded-xl pt-3 pb-6 px-4 bg-default flex flex-col">
          <div class="flex gap-2 items-center">
            <span class="text-xl">{{ !appearanceConf.hideHeader ? 'Boss-Helper' : 'Helper' }}</span>
            <UChip :show="isDot">
              <UButton color="primary" variant="subtle" @click="openStore" size="xs">
                v{{ VITE_VERSION }} {{ isDot ? ' 有更新' : '' }}
              </UButton>
            </UChip>
            <span v-if="todayData.total > 0" style="margin-right: 15px">
              今日投递: {{ todayData.success }}/{{ conf.formData.deliveryLimit.value }}
            </span>
            <span v-if="helper.workflow && helper.workflow.total.value > 0">
              当前页面处理: {{ helper.workflow.current.value }}/{{ helper.workflow.total.value }}
            </span>
          </div>

          <div v-if="helper.netConf.value && helper.netConf.value.notification" class="netAlerts">
            <template
              v-for="item in helper.netConf.value.notification.filter(
                (item) => item.type === 'alert',
              )"
              :key="item.key ?? item.data.title"
            >
              <Alert :id="`netConf-${item.key}`" v-bind="item.data" />
            </template>
          </div>
          <UTabs
            data-help="no-help"
            :items="items"
            variant="link"
            :ui="{ list: 'items-center' }"
            :unmount-on-hide="false"
          >
            <template #statistics>
              <Statistics />
            </template>
            <template #filter>
              <Filter />
            </template>
            <template #config><Config /></template>
            <template #ai><Ai /></template>
            <template #logs><Logs /></template>
            <template #about><About /></template>
            <template #list-trailing>
              <UButton
                class="ml-2"
                size="xs"
                color="primary"
                @click.stop="
                  () => {
                    chatOpen = !chatOpen
                  }
                "
                data-help="显示对话框, 使用ai功能必备可以方便的查询ai的输出, 并且可以调整招呼语. 不过功能未完善, 对话框使用体验还不行"
              >
                对话
              </UButton>
              <UButton
                v-if="helper.netConf.value?.feedback"
                class="ml-2"
                size="xs"
                color="info"
                @click.stop="tagOpen(helper.netConf.value.feedback)"
                data-help="描述清楚, 并先检查有没有相同问题, 尽量不要重复提交问题"
              >
                反馈
              </UButton>
              <UCheckbox
                class="ml-2"
                size="md"
                color="neutral"
                v-model="isFeatureEnabled"
                label="帮助"
              />
            </template>
          </UTabs>
        </div>
      </div>
      <JobCards />
      <ChatBox v-model:open="chatOpen" />
    </UApp>
  </div>
</template>
