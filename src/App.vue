<script lang="ts" setup>
import type { TabsItem } from '@nuxt/ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import ChatBox from '@/components/ChatBox.vue'
import JobCards from '@/components/JobCards.vue'
import About from '@/components/Tabs/About.vue'
import Appearance from '@/components/Tabs/ConfigItem/Appearance.vue'
import Filter from '@/components/Tabs/Filter.vue'
import Logs from '@/components/Tabs/Logs.vue'
import Statistics from '@/components/Tabs/Statistics.vue'
import Version from '@/components/Version.vue'
import { useConf, appearanceConf } from '@/composables/conf'
import { useAccounts } from '@/composables/useAccounts'
import { useModel } from '@/composables/useModel'
import { counter } from '@/message'
import { logger } from '@/utils/logger'

import { useHelper, VITE_VERSION } from './composables/useHelper'
import { get_system_version } from './utils'

const model = useModel()

const helper = useHelper()
const { todayData } = helper.statistics
const conf = useConf()
const accounts = useAccounts()
const switchingAccount = ref(false)
const toast = useToast()
const protocolShow = ref(false)
const protocol = 'boss-protocol'
// 修改此日期后，用户需要重新阅读并同意协议。
const protocolVal = '2026/10/21'

async function onProtocol() {
  await counter.storageSet(protocol, protocolVal)
  protocolShow.value = false
}
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

onMounted(async () => {
  window.addEventListener('focus', refreshConfiguration)
  void refreshConfiguration()
  chatOpen.value = appearanceConf.value.defaultShowChatBox

  logger.info('BossHelper挂载成功')
  toast.add({
    description: 'BossHelper挂载成功!',
    duration: 2000,
  })

  const protocolDate = await counter.storageGet<string>(protocol)
  protocolShow.value = protocolDate !== protocolVal
})

function feedback() {
  const url = helper.netConf.value?.feedback
  if (url) {
    const feedbackText = get_system_version()
    try {
      navigator.clipboard.writeText(feedbackText)
      toast.add({ title: '环境信息已复制到剪贴板', color: 'success' })
    } catch {}
    if (
      prompt(
        '即将前往github进行反馈, 已尝试自动复制版本信息, 如果失败请尝试手动复制, 点击确认即刻跳转',
        feedbackText,
      )
    ) {
      window.open(url)
    }
  } else {
    toast.add({ title: '暂无反馈地址', color: 'error' })
  }
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
                  >切换预设
                </UButton>
              </UDropdownMenu>
              <UButton
                v-if="helper.netConf.value?.feedback"
                class="ml-2"
                size="xs"
                color="info"
                @click.stop="feedback"
              >
                反馈
              </UButton>
            </template>
          </UTabs>
        </div>
        <JobCards />
      </div>
      <ChatBox v-model:open="chatOpen" />
      <UModal
        v-model:open="protocolShow"
        title="Boss-Helper协议"
        :close="false"
        :dismissible="false"
      >
        <template #body>
          1. 本插件完全免费且100%开源, 如果你是付费购买则是被骗了, 请投诉并举报商家
          <br />
          2. 暂时不维护文档(维护了也不会有多少人看), 所以配置会添加帮助信息, 足够理解用途,
          不理解可反馈进行文案优化
          <br />
          3. 非常欢迎大家来提优化意见, pr提交(需参考CONTRIBUTING), tg交流群交流
          <ULink to="https://t.me/ocyss_boss_helper" target="_blank">
            https://t.me/ocyss_boss_helper
          </ULink>
          <br />
          4. 遇到bug反馈之前一定需要分清是不是插件问题, 插件是否更新到最新版.
          <br />
          原生筛选并不严格, 其次无法下一页请手动滚到底部看看能否加载, 80%反馈均跟插件无关
          <br />
          如果还是有大量无用算命反馈, 插件将不再公开维护, 仅小范围自用更新
          <br />
          5. 投递在达到上限，或者页面无法滚动时会结束投递.
          <br />
          6. 不再维护暗黑模式, 可改用
          <ULink to="https://darkreader.org" target="_blank"> darkreader 扩展 </ULink>
          实现(会帮忙兼容)
          <br />
          7. 不再维护多账号模式的ck保存跟切换, 自行退出或使用其他插件/浏览器容器来实现
          <br />
          <br />
          如果不同意该协议, 请手动卸载本插件
          <br />
          <br />
          本项目仅供学习交流，禁止用于商业用途
          <br />
          使用该脚本有一定风险(如黑号,封号,权重降低等)，本项目不承担任何责任
          <br />
          Github开源地址:
          <ULink to="https://github.com/ocyss/boss-helper" target="_blank">
            https://github.com/ocyss/boss-helper
          </ULink>
        </template>
        <template #footer>
          <UButton color="error" @click="onProtocol"> 了解并同意! </UButton>
        </template>
      </UModal>
    </UApp>
  </div>
</template>
