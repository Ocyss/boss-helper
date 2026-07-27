<script lang="ts" setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'

import { ChatAutomationStore } from '@/chatAutomation'
import type { ChatNotification, ConversationState } from '@/chatAutomation'
import { getBossChatUrlForNotification } from '@/chatAutomation/chatUrl'
import { getChatConnectionStatus, subscribeChatConnectionStatus } from '@/chatAutomation/connection'
import { readReceiptBlockingSupported } from '@/chatAutomation/readReceipt'
import { retryChatConnection, sendStoredChatDraft } from '@/chatAutomation/runtime'
import { useConf } from '@/composables/conf'
import { activityLog } from '@/composables/useActivityLog'
import { useBlacklist } from '@/composables/useBlacklist'
import type {
  BlacklistKeywordScope,
  BlacklistList,
  BlacklistMatchMode,
  BlacklistTarget,
} from '@/composables/useBlacklist'
import { useCompanyRiskExternalStatus } from '@/composables/useCompanyRisk'
import type { ChatAllowlistRule } from '@/types/formData'

const conf = useConf()
const blacklist = useBlacklist()
const companyRiskExternalStatus = useCompanyRiskExternalStatus()
const toast = useToast()

const rules = computed(() => blacklist.rules.value)
const importing = ref('')
const saving = ref(false)
const addingRule = ref(false)
const chatStore = new ChatAutomationStore()
const notifications = ref<ChatNotification[]>([])
const conversationStates = ref<ConversationState[]>([])
const sendingNotificationId = ref<string | null>(null)
const connectionStatus = ref(getChatConnectionStatus())
const retryingConnection = ref(false)
let stopConnectionStatus = () => {}
const newAllowlistRule = reactive<ChatAllowlistRule>({
  target: 'company',
  matchMode: 'exact',
  value: '',
})
const rule = reactive<{
  list: BlacklistList
  target: BlacklistTarget
  matchMode: BlacklistMatchMode
  keywordScopes: BlacklistKeywordScope[]
  value: string
  reason: string
  expiresAt: string
}>({
  list: 'blacklist',
  target: 'company',
  matchMode: 'contains',
  keywordScopes: [],
  value: '',
  reason: '',
  expiresAt: '',
})

const providerItems = [
  { label: '仅本地规则', value: 'none' },
  { label: '天眼查 Open API', value: 'tianyancha' },
  { label: '企查查 Open API', value: 'qichacha' },
  { label: '自定义企业信息 API', value: 'custom' },
]
const modeItems = [
  { label: '提醒我回复（推荐）', value: 'remind' },
  { label: 'AI 草稿建议', value: 'suggest' },
  { label: '半自动确认', value: 'confirm' },
  { label: '全自动回复', value: 'auto' },
]
const riskThresholdItems = [
  { label: '宽松：60 分以上拦截', value: 60 },
  { label: '推荐：50 分以上拦截', value: 50 },
  { label: '严格：40 分以上拦截', value: 40 },
]
const cacheMinutesItems = [
  { label: '1 小时', value: 60 },
  { label: '6 小时', value: 60 * 6 },
  { label: '1 天（推荐）', value: 60 * 24 },
  { label: '7 天', value: 60 * 24 * 7 },
]
const quietPeriodItems = [
  { label: '不设免打扰', value: 'off' },
  { label: '22:00 - 08:00（推荐）', value: '22:00-08:00' },
  { label: '23:00 - 08:00', value: '23:00-08:00' },
  { label: '自定义时段', value: 'custom' },
]
const replyLimitItems = [
  { label: '每会话 1 次', value: 1 },
  { label: '每会话 3 次（推荐）', value: 3 },
  { label: '每会话 5 次', value: 5 },
]
const cooldownItems = [
  { label: '不冷却', value: 0 },
  { label: '10 分钟（推荐）', value: 10 },
  { label: '30 分钟', value: 30 },
  { label: '1 小时', value: 60 },
]
const dailyReplyLimitItems = [
  { label: '每天 10 条', value: 10 },
  { label: '每天 20 条（推荐）', value: 20 },
  { label: '每天 50 条', value: 50 },
]
const listItems = [
  { label: '黑名单', value: 'blacklist' },
  { label: '白名单', value: 'whitelist' },
]
const targetItems = [
  { label: '公司', value: 'company' },
  { label: 'HR', value: 'hr' },
  { label: '岗位', value: 'job' },
  { label: '关键词', value: 'keyword' },
]
const matchItems = [
  { label: '包含', value: 'contains' },
  { label: '精确', value: 'exact' },
]
const keywordScopeItems = [
  { label: '岗位名', value: 'job-name' },
  { label: '职位描述', value: 'description' },
  { label: '福利', value: 'welfare' },
  { label: '公司介绍', value: 'company-introduction' },
  { label: '技能', value: 'skills' },
]
const sectionItems = [
  { label: '风险筛查', value: 'risk', icon: 'i-lucide-shield-alert' },
  { label: '黑白名单', value: 'blacklist', icon: 'i-lucide-list-filter' },
  { label: '聊天自动化', value: 'chat', icon: 'i-lucide-message-square-more' },
  { label: '消息与会话', value: 'history', icon: 'i-lucide-bell' },
]

type ChatAllowlistViewRule = ChatAllowlistRule & { index: number; legacy: boolean }

const chatAllowlistRules = computed<ChatAllowlistViewRule[]>(() =>
  conf.formData.chatAutomation.allowlist
    .map((rule, index) =>
      typeof rule === 'string'
        ? {
            target: 'company' as const,
            matchMode: 'contains' as const,
            value: rule,
            index,
            legacy: true,
          }
        : { ...rule, index, legacy: false },
    )
    .filter((rule) => Boolean(rule.value.trim())),
)

const chatAllowlistTargetItems = [
  { label: '公司', value: 'company' },
  { label: 'HR 名称', value: 'hr' },
  { label: '岗位', value: 'job' },
  { label: 'HR ID', value: 'hr-id' },
]
const chatAllowlistMatchItems = [
  { label: '精确', value: 'exact' },
  { label: '包含', value: 'contains' },
]

const usesScopedReplyAutomation = computed(() =>
  ['confirm', 'auto'].includes(conf.formData.chatAutomation.mode),
)

function addChatAllowlistRule() {
  if (!newAllowlistRule.value.trim()) return
  conf.formData.chatAutomation.allowlist.push({
    ...newAllowlistRule,
    value: newAllowlistRule.value.trim(),
  })
  newAllowlistRule.value = ''
}

function removeChatAllowlistRule(index: number) {
  conf.formData.chatAutomation.allowlist.splice(index, 1)
}

async function retryConnection() {
  retryingConnection.value = true
  try {
    await retryChatConnection()
  } catch (error) {
    toast.add({
      title: error instanceof Error ? `聊天连接失败：${error.message}` : '聊天连接失败',
      color: 'error',
    })
  } finally {
    retryingConnection.value = false
  }
}

function connectionStatusLabel() {
  return {
    idle: '未连接',
    connecting: '连接中',
    connected: '已连接',
    failed: '连接失败',
  }[connectionStatus.value.state]
}

const quietPeriod = computed({
  get() {
    const { quietStart, quietEnd } = conf.formData.chatAutomation
    if (!quietStart && !quietEnd) return 'off'
    const value = `${quietStart}-${quietEnd}`
    return quietPeriodItems.some((item) => item.value === value) ? value : 'custom'
  },
  set(value: string) {
    if (value === 'off') {
      conf.formData.chatAutomation.quietStart = ''
      conf.formData.chatAutomation.quietEnd = ''
      return
    }
    if (value === 'custom') return
    const [quietStart, quietEnd] = value.split('-')
    conf.formData.chatAutomation.quietStart = quietStart
    conf.formData.chatAutomation.quietEnd = quietEnd
  },
})

async function save() {
  saving.value = true
  try {
    await conf.confSaving()
  } finally {
    saving.value = false
  }
}

async function addRule() {
  if (!rule.value.trim()) {
    toast.add({ title: '请输入要匹配的内容', color: 'warning' })
    return
  }
  addingRule.value = true
  try {
    await blacklist.addRule({
      list: rule.list,
      target: rule.target,
      matchMode: rule.matchMode,
      keywordScopes: rule.target === 'keyword' ? rule.keywordScopes : undefined,
      value: rule.value,
      reason: rule.reason,
      expiresAt: rule.expiresAt ? new Date(`${rule.expiresAt}T23:59:59`).getTime() : null,
    })
    rule.value = ''
    rule.reason = ''
    rule.expiresAt = ''
    rule.keywordScopes = []
    toast.add({ title: '规则已添加', color: 'success' })
  } finally {
    addingRule.value = false
  }
}

async function importRules(mode: 'replace' | 'merge') {
  try {
    const count = await blacklist.importRules(JSON.parse(importing.value), mode)
    toast.add({ title: `已导入 ${count} 条规则`, color: 'success' })
  } catch {
    toast.add({ title: '导入内容不是有效的规则 JSON', color: 'error' })
  }
}

function exportRules() {
  importing.value = JSON.stringify(blacklist.exportRules(), null, 2)
}

function formatExpiresAt(value: number | null) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '永久'
}

function formatDate(value: number) {
  return new Date(value).toLocaleString('zh-CN')
}

async function openNotificationConversation(notification: ChatNotification) {
  const url = getBossChatUrlForNotification(notification)
  if (!url) {
    toast.add({ title: '未找到该会话的跳转地址', color: 'warning' })
    activityLog.add({
      category: '聊天自动化',
      action: '打开对应会话',
      status: 'action_required',
      message: '暂时无法定位对应会话，请在 BOSS 页面中手动打开该联系人。',
    })
    return
  }
  await chatStore.markNotificationRead(notification.id)
  activityLog.add({
    category: '聊天自动化',
    action: '打开对应会话',
    status: 'success',
    message: '正在打开对应会话。',
  })
  window.location.assign(url)
}

async function sendNotificationDraft(notification: ChatNotification) {
  if (
    !notification.draftReply ||
    notification.status === 'submitted' ||
    notification.status === 'replied'
  )
    return
  sendingNotificationId.value = notification.id
  try {
    await sendStoredChatDraft(notification.id)
    toast.add({ title: '发送请求已提交，平台送达状态尚未确认', color: 'success' })
    await refreshChatHistory()
  } catch (error) {
    toast.add({
      title: error instanceof Error ? `草稿发送失败：${error.message}` : '草稿发送失败',
      color: 'error',
    })
  } finally {
    sendingNotificationId.value = null
  }
}

async function refreshChatHistory() {
  await chatStore.reload()
  const [nextNotifications, nextConversationStates] = await Promise.all([
    chatStore.getNotifications(),
    chatStore.getConversationStates(),
  ])
  notifications.value = nextNotifications
  conversationStates.value = nextConversationStates
}

async function restoreConversation(conversationId: string) {
  await chatStore.updateConversationState(conversationId, {
    paused: false,
    manualTakeover: false,
  })
  activityLog.add({
    category: '聊天自动化',
    action: '恢复会话自动化',
    status: 'success',
    message: '该会话已恢复，后续新消息会继续按照当前规则处理。',
  })
  await refreshChatHistory()
}

onMounted(async () => {
  stopConnectionStatus = subscribeChatConnectionStatus((next) => {
    connectionStatus.value = next
  })
  try {
    await blacklist.init()
    await blacklist.cleanupExpired()
    await companyRiskExternalStatus.init()
    await refreshChatHistory()
  } catch (error) {
    toast.add({
      title: error instanceof Error ? `黑白名单加载失败: ${error.message}` : '黑白名单加载失败',
      color: 'error',
    })
  }
})

onUnmounted(() => stopConnectionStatus())
</script>

<template>
  <div class="mx-auto max-w-5xl" data-help="风险、黑白名单和聊天自动化">
    <div
      class="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-default pb-3"
    >
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
        <UCheckbox v-model="conf.formData.companyRisk.enable" label="风险筛查" />
        <UCheckbox v-model="conf.formData.chatAutomation.enable" label="聊天自动化" />
        <UCheckbox
          :model-value="readReceiptBlockingSupported"
          disabled
          label="已读拦截（待协议验证）"
        />
      </div>
      <UButton size="sm" icon="i-lucide-save" :loading="saving" @click="save">保存</UButton>
    </div>

    <UAccordion
      type="single"
      collapsible
      default-value="risk"
      :items="sectionItems"
      :ui="{ content: 'px-1 pb-4 pt-2' }"
    >
      <template #body="{ item }">
        <template v-if="item.value === 'risk'">
          <p class="mb-3 text-sm text-muted">未接入企业信息服务时，自动使用本地规则评分。</p>
          <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <UBadge
              :color="
                companyRiskExternalStatus.status.value.kind === 'fallback' ? 'warning' : 'neutral'
              "
              variant="subtle"
            >
              {{
                {
                  local: '本地规则',
                  cache: '企业信息缓存',
                  external: '外部企业信息',
                  fallback: '已回退本地规则',
                }[companyRiskExternalStatus.status.value.kind]
              }}
            </UBadge>
            <span class="text-muted">{{ companyRiskExternalStatus.status.value.message }}</span>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <UFormField label="拦截规则">
              <USelectMenu
                v-model="conf.formData.companyRisk.blockThreshold"
                :items="riskThresholdItems"
                value-key="value"
                :search-input="false"
              />
            </UFormField>
            <UFormField label="企业信息服务">
              <USelectMenu
                v-model="conf.formData.companyRisk.external.provider"
                :items="providerItems"
                value-key="value"
                :search-input="false"
              />
            </UFormField>
            <UFormField
              v-if="conf.formData.companyRisk.external.provider !== 'none'"
              label="缓存时间"
            >
              <USelectMenu
                v-model="conf.formData.companyRisk.external.cacheMinutes"
                :items="cacheMinutesItems"
                value-key="value"
                :search-input="false"
              />
            </UFormField>
          </div>

          <details v-if="conf.formData.companyRisk.external.provider !== 'none'" class="mt-3">
            <summary class="cursor-pointer text-sm text-muted">配置 API 地址与凭证</summary>
            <div class="mt-3 grid gap-3 md:grid-cols-2">
              <UFormField class="md:col-span-2" label="查询地址">
                <UInput
                  v-model="conf.formData.companyRisk.external.endpoint"
                  placeholder="https://example.com/company?keyword={companyName}"
                />
              </UFormField>
              <UFormField label="API Key">
                <UInput v-model="conf.formData.companyRisk.external.apiKey" type="password" />
              </UFormField>
              <UFormField label="API Secret（可选）">
                <UInput v-model="conf.formData.companyRisk.external.apiSecret" type="password" />
              </UFormField>
              <UFormField class="md:col-span-2" label="额外请求头 JSON（可选）">
                <UInput
                  v-model="conf.formData.companyRisk.external.headers"
                  placeholder='{"Header-Name":"value"}'
                />
              </UFormField>
            </div>
          </details>
        </template>

        <template v-else-if="item.value === 'blacklist'">
          <p class="mb-3 text-sm text-muted">
            白名单仅压过黑名单；薪资、地址、风险等其他筛选仍会执行。匹配不区分大小写。
          </p>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <UFormField label="名单">
              <USelectMenu
                v-model="rule.list"
                :items="listItems"
                value-key="value"
                :search-input="false"
              />
            </UFormField>
            <UFormField label="对象">
              <USelectMenu
                v-model="rule.target"
                :items="targetItems"
                value-key="value"
                :search-input="false"
              />
            </UFormField>
            <UFormField label="匹配">
              <USelectMenu
                v-model="rule.matchMode"
                :items="matchItems"
                value-key="value"
                :search-input="false"
              />
            </UFormField>
            <UFormField label="内容">
              <UInput
                v-model="rule.value"
                placeholder="公司、岗位或关键词"
                @keyup.enter="addRule"
              />
            </UFormField>
          </div>
          <UFormField v-if="rule.target === 'keyword'" class="mt-3" label="关键词匹配范围">
            <USelectMenu
              v-model="rule.keywordScopes"
              :items="keywordScopeItems"
              value-key="value"
              multiple
              placeholder="全部字段（兼容旧规则）"
            />
          </UFormField>
          <details class="mt-3">
            <summary class="cursor-pointer text-sm text-muted">添加原因或过期日期（可选）</summary>
            <div class="mt-3 grid gap-3 md:grid-cols-2">
              <UFormField label="命中原因">
                <UInput v-model="rule.reason" placeholder="例如：不考虑外包" />
              </UFormField>
              <UFormField label="过期日期">
                <UInput v-model="rule.expiresAt" type="date" />
              </UFormField>
            </div>
          </details>
          <div class="mt-3 flex flex-wrap justify-end gap-2">
            <UButton size="sm" color="neutral" variant="outline" @click="blacklist.cleanupExpired"
              >清理过期</UButton
            >
            <UButton size="sm" icon="i-lucide-ban" :loading="addingRule" @click="addRule"
              >添加规则</UButton
            >
          </div>

          <div
            v-if="rules.length"
            class="mt-3 divide-y divide-default border-y border-default text-sm"
          >
            <div v-for="entry in rules" :key="entry.id" class="flex items-center gap-3 py-2">
              <UBadge :color="entry.list === 'blacklist' ? 'error' : 'success'" variant="subtle">
                {{ entry.list === 'blacklist' ? '黑名单' : '白名单' }}
              </UBadge>
              <span class="hidden min-w-12 text-muted sm:inline">{{
                targetItems.find((option) => option.value === entry.target)?.label
              }}</span>
              <span class="min-w-0 flex-1 truncate" :title="entry.reason">{{ entry.value }}</span>
              <span class="hidden text-muted md:inline">{{
                entry.matchMode === 'exact' ? '精确' : '包含'
              }}</span>
              <span v-if="entry.target === 'keyword'" class="hidden text-muted lg:inline">
                {{
                  entry.keywordScopes?.length
                    ? entry.keywordScopes
                        .map(
                          (scope) =>
                            keywordScopeItems.find((option) => option.value === scope)?.label,
                        )
                        .filter(Boolean)
                        .join('、')
                    : '全部字段'
                }}
              </span>
              <span class="hidden text-muted xl:inline">{{
                formatExpiresAt(entry.expiresAt)
              }}</span>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="xs"
                title="删除规则"
                @click="blacklist.removeRule(entry.id)"
              />
            </div>
          </div>
          <p v-else class="mt-3 text-sm text-muted">暂无黑白名单规则。</p>

          <details class="mt-3">
            <summary class="cursor-pointer text-sm text-muted">导入或导出规则</summary>
            <UTextarea v-model="importing" class="mt-3" :rows="4" placeholder="规则 JSON" />
            <div class="mt-2 flex flex-wrap justify-end gap-2">
              <UButton size="sm" color="neutral" variant="outline" @click="exportRules"
                >导出</UButton
              >
              <UButton size="sm" color="neutral" variant="outline" @click="importRules('merge')"
                >合并导入</UButton
              >
              <UButton size="sm" color="warning" variant="outline" @click="importRules('replace')"
                >覆盖导入</UButton
              >
            </div>
          </details>
        </template>

        <template v-else-if="item.value === 'chat'">
          <p class="mb-3 text-sm text-muted">
            “提醒我回复”只发送提示，由你进入会话手动回复；“AI
            草稿建议”只生成草稿；半自动和全自动才会按白名单处理。
          </p>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <UFormField label="回复模式（收到新消息后做什么）">
              <USelectMenu
                v-model="conf.formData.chatAutomation.mode"
                :items="modeItems"
                value-key="value"
                :search-input="false"
              />
            </UFormField>
            <UFormField v-if="usesScopedReplyAutomation" label="自动处理静默时段（不生成或发送）">
              <USelectMenu
                v-model="quietPeriod"
                :items="quietPeriodItems"
                value-key="value"
                :search-input="false"
              />
            </UFormField>
            <UFormField v-if="usesScopedReplyAutomation" label="每会话上限（插件最多发送次数）">
              <USelectMenu
                v-model="conf.formData.chatAutomation.maxRepliesPerConversation"
                :items="replyLimitItems"
                value-key="value"
                :search-input="false"
              />
            </UFormField>
            <UFormField v-if="usesScopedReplyAutomation" label="回复冷却（两次插件回复的间隔）">
              <USelectMenu
                v-model="conf.formData.chatAutomation.cooldownMinutes"
                :items="cooldownItems"
                value-key="value"
                :search-input="false"
              />
            </UFormField>
            <UFormField v-if="usesScopedReplyAutomation" label="每日上限（插件当天最多发送次数）">
              <USelectMenu
                v-model="conf.formData.chatAutomation.dailyReplyLimit"
                :items="dailyReplyLimitItems"
                value-key="value"
                :search-input="false"
              />
            </UFormField>
          </div>

          <p
            v-if="
              conf.formData.chatAutomation.mode === 'remind' &&
              !conf.formData.chatAutomation.browserNotification &&
              !conf.formData.chatAutomation.pagePopup
            "
            class="mt-3 text-sm text-warning"
          >
            请至少开启一种提示方式，否则收到消息后无法直接提醒你回复。
          </p>

          <div
            v-if="usesScopedReplyAutomation && quietPeriod === 'custom'"
            class="mt-3 grid gap-3 md:grid-cols-2"
          >
            <UFormField label="开始时间">
              <UInput v-model="conf.formData.chatAutomation.quietStart" type="time" />
            </UFormField>
            <UFormField label="结束时间">
              <UInput v-model="conf.formData.chatAutomation.quietEnd" type="time" />
            </UFormField>
          </div>
          <div v-if="usesScopedReplyAutomation" class="mt-3">
            <p class="mb-2 text-sm font-medium">自动回复允许名单</p>
            <p class="mb-2 text-xs text-muted">
              只允许命中的会话自动生成或发送；旧文本规则仍按原来的跨字段包含语义执行，并标为“旧规则”。
            </p>
            <div class="grid gap-2 md:grid-cols-[120px_100px_minmax(0,1fr)_auto]">
              <USelectMenu
                v-model="newAllowlistRule.target"
                :items="chatAllowlistTargetItems"
                value-key="value"
                :search-input="false"
              />
              <USelectMenu
                v-model="newAllowlistRule.matchMode"
                :items="chatAllowlistMatchItems"
                value-key="value"
                :search-input="false"
              />
              <UInput
                v-model="newAllowlistRule.value"
                placeholder="匹配内容"
                @keyup.enter="addChatAllowlistRule"
              />
              <UButton size="sm" icon="i-lucide-plus" @click="addChatAllowlistRule">添加</UButton>
            </div>
            <div
              v-if="chatAllowlistRules.length"
              class="mt-2 divide-y divide-default border-y border-default text-sm"
            >
              <div
                v-for="entry in chatAllowlistRules"
                :key="`${entry.target}-${entry.matchMode}-${entry.value}-${entry.index}`"
                class="flex items-center gap-2 py-2"
              >
                <UBadge variant="subtle">{{
                  entry.legacy
                    ? '旧规则（跨字段）'
                    : chatAllowlistTargetItems.find((item) => item.value === entry.target)?.label
                }}</UBadge>
                <span class="text-muted">{{ entry.matchMode === 'exact' ? '精确' : '包含' }}</span>
                <span class="min-w-0 flex-1 truncate">{{ entry.value }}</span>
                <UButton
                  icon="i-lucide-trash-2"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  title="删除允许规则"
                  @click="removeChatAllowlistRule(entry.index)"
                />
              </div>
            </div>
          </div>
          <UFormField
            v-if="conf.formData.chatAutomation.mode === 'auto'"
            class="mt-3"
            label="自动回复触发词（只有命中的消息才发送）"
          >
            <UInputTags
              v-model="conf.formData.chatAutomation.keywords"
              placeholder="输入后按回车添加"
            />
          </UFormField>

          <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <UCheckbox
              v-model="conf.formData.chatAutomation.browserNotification"
              label="浏览器通知（离开 BOSS 页面也会提示）"
            />
            <UCheckbox
              v-model="conf.formData.chatAutomation.pagePopup"
              label="页面浮窗（BOSS 页面右下角提示）"
            />
            <span class="text-muted">尚未确认真实已读协议，当前不会拦截任何请求。</span>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <UBadge
              :color="
                connectionStatus.state === 'connected'
                  ? 'success'
                  : connectionStatus.state === 'failed'
                    ? 'error'
                    : 'neutral'
              "
              variant="subtle"
              >聊天通道：{{ connectionStatusLabel() }}</UBadge
            >
            <span v-if="connectionStatus.state === 'failed'" class="text-muted">
              {{ connectionStatus.error || '连接失败，请重试' }}
            </span>
            <UButton
              v-if="connectionStatus.state !== 'connected'"
              size="xs"
              color="neutral"
              variant="outline"
              :loading="retryingConnection || connectionStatus.state === 'connecting'"
              @click="retryConnection"
              >重试连接</UButton
            >
          </div>

          <details class="mt-3">
            <summary class="cursor-pointer text-sm text-muted">
              人工处理关键词（命中后只提醒，不生成或发送）
            </summary>
            <UFormField class="mt-3" label="命中后不自动发送">
              <UInputTags v-model="conf.formData.chatAutomation.manualReviewKeywords" />
            </UFormField>
          </details>
        </template>

        <template v-else>
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm text-muted">消息草稿、暂停与人工接管状态均只保存在本地。</p>
            <UButton size="xs" color="neutral" variant="outline" @click="refreshChatHistory"
              >刷新</UButton
            >
          </div>
          <div
            v-if="notifications.length"
            class="divide-y divide-default border-y border-default text-sm"
          >
            <div
              v-for="notification in notifications.slice(0, 6)"
              :key="notification.id"
              class="cursor-pointer py-2"
              role="button"
              tabindex="0"
              title="点击进入对应会话"
              @click="openNotificationConversation(notification)"
              @keydown.enter="openNotificationConversation(notification)"
              @keydown.space.prevent="openNotificationConversation(notification)"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="min-w-0 truncate font-medium">{{ notification.title }}</span>
                <div class="flex shrink-0 items-center gap-2">
                  <span class="text-xs text-muted">{{ formatDate(notification.createdAt) }}</span>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-external-link"
                    title="进入会话"
                    @click.stop="openNotificationConversation(notification)"
                  />
                  <UButton
                    v-if="
                      notification.draftReply &&
                      notification.status !== 'submitted' &&
                      notification.status !== 'replied'
                    "
                    size="xs"
                    color="primary"
                    variant="ghost"
                    icon="i-lucide-send"
                    title="发送草稿"
                    :loading="sendingNotificationId === notification.id"
                    @click.stop="sendNotificationDraft(notification)"
                  />
                </div>
              </div>
              <p class="mt-1 truncate text-muted">{{ notification.message }}</p>
              <p v-if="notification.draftReply" class="mt-1 truncate text-primary">
                草稿：{{ notification.draftReply }}
              </p>
            </div>
          </div>
          <p v-else class="text-sm text-muted">暂无消息通知。</p>

          <div
            v-if="conversationStates.some((state) => state.paused || state.manualTakeover)"
            class="mt-3"
          >
            <p class="mb-2 text-sm font-medium">已暂停或人工接管的会话</p>
            <div class="divide-y divide-default border-y border-default text-sm">
              <div
                v-for="state in conversationStates.filter(
                  (entry) => entry.paused || entry.manualTakeover,
                )"
                :key="state.conversationId"
                class="flex items-center gap-3 py-2"
              >
                <span class="min-w-0 flex-1 truncate">{{ state.conversationId }}</span>
                <UBadge color="warning" variant="subtle">{{
                  state.manualTakeover ? '人工接管' : '已暂停'
                }}</UBadge>
                <UButton
                  icon="i-lucide-play"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  title="恢复自动化"
                  @click="restoreConversation(state.conversationId)"
                />
              </div>
            </div>
          </div>
        </template>
      </template>
    </UAccordion>
  </div>
</template>
