<script lang="ts" setup>
import type { TabsItem } from '@nuxt/ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import ChatBox from '@/components/ChatBox.vue'
import JobCards from '@/components/JobCards.vue'
import Version from '@/components/Menu/Version.vue'
import About from '@/components/Tabs/About.vue'
import Appearance from '@/components/Tabs/ConfigItem/Appearance.vue'
import Filter from '@/components/Tabs/Filter.vue'
import Logs from '@/components/Tabs/Logs.vue'
import Statistics from '@/components/Tabs/Statistics.vue'
import { useConf, appearanceConf } from '@/composables/conf'
import { useAccounts } from '@/composables/useAccounts'
import { useModel } from '@/composables/useModel'
import { counter } from '@/message'

import { useHelper, VITE_VERSION } from './composables/useHelper'

const model = useModel()

const helper = useHelper()
const { todayData } = helper.statistics
const conf = useConf()
const accounts = useAccounts()
const switchingAccount = ref(false)
const toast = useToast()
const presetOptions = ref<{ label: string; value: string }[]>([])
const presetName = computed(() => {
  if (conf.formDataPreset.value === accounts.currentAccount.value?.preset) return ''
  return (
    presetOptions.value.find((preset) => preset.value === conf.formDataPreset.value)?.label ?? ''
  )
})
async function loadPresetOptions() {
  presetOptions.value = await counter.storageGet('local:FormDataPreses', [
    { label: '默认配置', value: 'default' },
  ])
}
async function switchPreset(value: string) {
  if (helper.workflowRunning.value || switchingAccount.value) return
  switchingAccount.value = true
  try {
    await conf.switchPreset(value)
    await model.initModel()
  } finally {
    switchingAccount.value = false
  }
}
async function switchAccount() {
  if (helper.workflowRunning.value || switchingAccount.value) return
  switchingAccount.value = true
  try {
    await accounts.init()
    const list = accounts.accounts.value
    const index = list.findIndex((a) => a.value === accounts.activeAccount.value)
    const next = list[(index + 1) % list.length]
    if (!next) return
    await accounts.selectAccount(next.value)
    await helper.statistics.updateStatistics()
    await conf.switchPreset(next.preset)
    await model.initModel()
  } catch (error) {
    toast.add({ title: `账号切换失败: ${String(error)}`, color: 'error' })
  } finally {
    switchingAccount.value = false
  }
}

const items = computed<TabsItem[]>(() => {
  const configs = [
    { slot: 'statistics', label: '统计' },
    { slot: 'filter', label: '筛选' },
    { slot: 'appearance', label: '外观' },

    { slot: 'logs', label: '日志' },
    {
      slot: 'about',
      label: '关于&赞赏',
    },
  ] satisfies (TabsItem | boolean | null | undefined | '')[]

  return configs.filter((item) => !!item) as TabsItem[]
})

// const externalFilter = ref<HTMLElement>()
const container = ref<HTMLElement>()
const chatOpen = ref(appearanceConf.value.defaultShowChatBox)

async function refreshConfiguration() {
  if (helper.workflowRunning.value || switchingAccount.value) return
  await conf.confInit()
  await Promise.all([helper.statistics.updateStatistics(), loadPresetOptions(), model.initModel()])
}

onUnmounted(() => window.removeEventListener('focus', refreshConfiguration))

onMounted(() => {
  window.addEventListener('focus', refreshConfiguration)
  void refreshConfiguration()
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
</script>

<template>
  <div
    class="shadow-wrapper m-10 mx-auto mb-24"
    :style="{
      width: `${appearanceConf.contentWidth}px`,
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
      <div class="bg-default rounded-xl overflow-hidden">
        <div class="pt-3 pb-6 px-4 flex flex-col">
          <div class="flex gap-2 items-center">
            <span class="text-xl"
              >{{ !appearanceConf.hideHeader ? 'Boss-Helper' : 'Helper'
              }}<template v-if="accounts.activeAccount.value !== 'default'">
                ({{ accounts.currentAccount.value?.label }})</template
              ><template v-if="presetName"> (预设: {{ presetName }})</template></span
            >
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

            <template #appearance><Appearance /></template>
            <template #logs><Logs /></template>
            <template #about><About /></template>
            <template #list-trailing>
              <UButton class="ml-2" size="xs" @click="counter.openOptionsPage()"> 配置 </UButton>
              <UButton
                class="ml-2"
                size="xs"
                color="primary"
                @click.stop="
                  () => {
                    chatOpen = !chatOpen
                  }
                "
              >
                对话
              </UButton>
              <UButton
                v-if="accounts.accounts.value.length > 1"
                class="ml-2"
                size="xs"
                :disabled="helper.workflowRunning.value"
                :loading="switchingAccount"
                @click="switchAccount"
                >切换账号</UButton
              >
              <UDropdownMenu
                :items="
                  presetOptions.map((preset) => ({
                    label: preset.label,
                    onSelect: () => switchPreset(preset.value),
                  }))
                "
                @update:open="(open) => open && loadPresetOptions()"
              >
                <UButton
                  class="ml-2"
                  size="xs"
                  :disabled="helper.workflowRunning.value"
                  :loading="switchingAccount"
                  >切换预设</UButton
                >
              </UDropdownMenu>
              <UButton
                v-if="helper.netConf.value?.feedback"
                class="ml-2"
                size="xs"
                color="info"
                @click.stop="tagOpen(helper.netConf.value.feedback)"
              >
                反馈
              </UButton>
            </template>
          </UTabs>
        </div>
        <JobCards />
      </div>
      <ChatBox v-model:open="chatOpen" />
    </UApp>
  </div>
</template>
