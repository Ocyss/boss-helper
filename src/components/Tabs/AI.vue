<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { browser } from 'wxt/browser'

import LLMModelManage from '@/components/AI/LLMModelManage.vue'
import LLMPromptEdit from '@/components/AI/LLMPromptEdit.vue'
import FormSwitch from '@/components/Tabs/ConfigItem/Form/FormSwitch.vue'
import { formInfoData, useConf } from '@/composables/conf'
import {
  createEmptyCandidateProfile,
  getCandidateProfile,
  parseCandidateProfile,
  setCandidateProfile,
} from '@/composables/useApplying/utils'
import type { CandidateProfile } from '@/composables/useApplying/utils'
import { useHelper } from '@/composables/useHelper'
import { counter } from '@/message'
import type { FormDataAi } from '@/types/formData'
import type { ReplyDraftItem } from '@/types/replyDraft'
import { exportJson, importJson } from '@/utils/jsonImportExport'
import { v2StorageKey } from '@/utils/namespace'

const helper = useHelper()
const conf = useConf()
const aiBoxShow = ref(false)
const aiConfBoxShow = ref(false)
const aiBox = ref<'aiGreeting' | 'aiFiltering' | 'aiReply' | 'record'>('aiGreeting')
const candidateProfile = ref('')
const monitorEnabled = ref(false)
const profileSaving = ref(false)
const profileError = ref('')
const draftQueue = ref<ReplyDraftItem[]>([])
const draftQueueLoading = ref(false)
const generatingKey = ref('')
const draftQueueMessage = ref('')
const toast = useToast()

const draftQueueStorageKey = v2StorageKey('reply-draft-queue')

function draftKey(item: ReplyDraftItem): string {
  return `${item.conversationId}:${item.messageId}`
}

onMounted(async () => {
  try {
    candidateProfile.value = JSON.stringify(await getCandidateProfile(), null, 2)
    monitorEnabled.value = await counter.storageGet(
      'local:boss-helper-v2:reply-monitor-enabled',
      false,
    )
    await refreshDraftQueue()
  } catch {
    profileError.value = '读取本机画像失败，当前不会调用 AI。'
  }
})

async function saveCandidateProfile() {
  profileSaving.value = true
  profileError.value = ''
  try {
    const parsed = parseCandidateProfile(candidateProfile.value)
    if (!parsed) {
      profileError.value = '画像必须是 candidate-profile.v1 JSON，字段不完整时不会用于 AI。'
      return
    }
    await setCandidateProfile(parsed as CandidateProfile)
  } catch {
    profileError.value = '画像保存失败，未改变本机已有配置。'
  } finally {
    profileSaving.value = false
  }
}

/** 导出严格限定字段的 candidate-profile.v1，不包含密钥、Cookie 或聊天队列。 */
async function exportCandidateProfile() {
  const profile = await getCandidateProfile()
  // 画像文本可能由用户误填手机号；导出前只做本地脱敏，不改变正在使用的画像。
  const safeProfile = JSON.parse(
    JSON.stringify(profile).replace(/(?<!\d)1[3-9]\d{9}(?!\d)/gu, '[手机号已隐藏]'),
  )
  exportJson(safeProfile, 'candidate-profile.v1')
}

/** 导入画像前先做 schema 校验，非法文件不会覆盖本机画像。 */
async function importCandidateProfile() {
  try {
    const parsed = parseCandidateProfile(await importJson<unknown>())
    if (!parsed) {
      toast.add({ title: '画像格式无效，未导入', color: 'error' })
      return
    }
    candidateProfile.value = JSON.stringify(parsed, null, 2)
    toast.add({ title: '画像已载入，请点击保存画像', color: 'success' })
  } catch {
    toast.add({ title: '画像导入失败，未改变本机配置', color: 'error' })
  }
}

/** 从 V2 local namespace 刷新待人工确认草稿队列。 */
async function refreshDraftQueue() {
  draftQueueLoading.value = true
  try {
    const value = await counter.storageGet<ReplyDraftItem[]>(draftQueueStorageKey, [])
    draftQueue.value = Array.isArray(value) ? value.slice(-100).reverse() : []
    draftQueueMessage.value = ''
  } catch {
    draftQueueMessage.value = '草稿队列读取失败'
  } finally {
    draftQueueLoading.value = false
  }
}

/** 请求 background/service worker 生成一条草稿，不执行填入或发送。 */
async function generateDraft(item: ReplyDraftItem) {
  generatingKey.value = draftKey(item)
  draftQueueMessage.value = ''
  try {
    const result = (await browser.runtime.sendMessage({
      type: 'BHV2_GENERATE_REPLY_DRAFT',
      conversationId: item.conversationId,
      messageId: item.messageId,
    })) as { ok?: boolean; draft?: string; error?: string }
    draftQueueMessage.value = result?.ok
      ? '草稿已生成，请人工确认后复制使用。'
      : result?.error || '草稿生成失败'
    await refreshDraftQueue()
  } catch {
    draftQueueMessage.value = '后台模型请求失败，未发送任何消息'
  } finally {
    generatingKey.value = ''
  }
}

/** 仅复制已生成的草稿，用户仍需自行粘贴并点击 BOSS 官方发送按钮。 */
async function copyDraft(draft: string) {
  try {
    await navigator.clipboard.writeText(draft)
    draftQueueMessage.value = '草稿已复制到剪贴板；未填入或发送。'
  } catch {
    draftQueueMessage.value = '复制失败，请手动选择文本。'
  }
}

async function saveMonitorEnabled(value: boolean) {
  monitorEnabled.value = value
  try {
    await counter.storageSet('local:boss-helper-v2:reply-monitor-enabled', value)
  } catch {
    monitorEnabled.value = !value
    profileError.value = '监控开关保存失败，已恢复原状态。'
  }
}

function change(v: Partial<FormDataAi>) {
  v.enable = !v.enable
  conf.confSaving()
}
</script>

<template>
  <div class="flex flex-col gap-3" data-help="AI 配置">
    <div class="flex flex-wrap gap-3">
      <FormSwitch
        :label="formInfoData.aiGreeting.label"
        :data-help="formInfoData.aiGreeting['data-help']"
        :data="conf.formData.aiGreeting"
        :lock="helper.workflow?.status.value === 'running'"
        @show="
          () => {
            aiBox = 'aiGreeting'
            aiBoxShow = true
          }
        "
        @change="change"
      />
      <FormSwitch
        :label="formInfoData.aiFiltering.label"
        :data-help="formInfoData.aiFiltering['data-help']"
        :data="conf.formData.aiFiltering"
        :lock="helper.workflow?.status.value === 'running'"
        @show="
          () => {
            aiBox = 'aiFiltering'
            aiBoxShow = true
          }
        "
        @change="change"
      />
      <FormSwitch
        :label="formInfoData.aiReply.label"
        :data-help="formInfoData.aiReply['data-help']"
        :data="conf.formData.aiReply"
        disabled
        @show="
          () => {
            aiBox = 'aiReply'
            aiBoxShow = true
          }
        "
        @change="change"
      />
      <!-- <formSwitch
      v-bind="formInfoData.record"
      :data="formData.record"
      @show="
        aiBox = 'record';
        aiBoxShow = true;
      "
      @change="change"
    /> -->
    </div>
    <div>
      <LLMModelManage>
        <UButton
          color="primary"
          data-help="配置需要使用的LLM大模型"
          @click="
            () => {
              aiConfBoxShow = true
            }
          "
        >
          模型配置
        </UButton>
      </LLMModelManage>
    </div>
    <UFormField
      label="候选人事实画像"
      description="只保存在本机扩展配置，用于 AI 筛选和招呼语；不要填写密钥或 Cookie。"
    >
      <UTextarea
        v-model="candidateProfile"
        :rows="10"
        class="w-full font-mono text-xs"
        :placeholder="JSON.stringify(createEmptyCandidateProfile(), null, 2)"
      />
      <UButton class="mt-2" size="sm" :loading="profileSaving" @click="saveCandidateProfile"
        >保存画像</UButton
      >
      <UButton class="mt-2 ml-2" size="sm" variant="outline" @click="importCandidateProfile"
        >导入画像</UButton
      >
      <UButton class="mt-2 ml-2" size="sm" variant="outline" @click="exportCandidateProfile"
        >导出画像（无密钥）</UButton
      >
      <p v-if="profileError" class="mt-1 text-xs text-red-600">{{ profileError }}</p>
    </UFormField>
    <UCheckbox
      :model-value="monitorEnabled"
      label="回复监控（通知+草稿，默认关闭）"
      description="仅检测页面 DOM；通知点击打开会话，不自动填入或发送。"
      @update:model-value="saveMonitorEnabled(Boolean($event))"
    />

    <UFormField
      label="回复监控草稿队列"
      description="队列只保存在本机；生成、复制和发送都需要用户主动操作。"
    >
      <div class="flex items-center gap-2">
        <UButton size="sm" variant="outline" :loading="draftQueueLoading" @click="refreshDraftQueue"
          >刷新队列</UButton
        >
        <span class="text-xs text-gray-500">{{ draftQueue.length }} 条</span>
      </div>
      <div v-if="draftQueueMessage" class="mt-1 text-xs text-gray-600">{{ draftQueueMessage }}</div>
      <div
        v-if="draftQueue.length === 0"
        class="mt-2 rounded border border-dashed p-3 text-xs text-gray-400"
      >
        暂无待确认消息；开启监控后，页面 DOM 检测到未读来信才会入队。
      </div>
      <div v-else class="mt-2 flex max-h-80 flex-col gap-2 overflow-auto">
        <div v-for="item in draftQueue" :key="draftKey(item)" class="rounded border p-2 text-xs">
          <div class="flex items-center justify-between gap-2 text-gray-500">
            <span class="truncate">会话 {{ item.conversationId }}</span>
            <span>{{
              item.status === 'ready' ? '已生成' : item.status === 'error' ? '失败' : '待生成'
            }}</span>
          </div>
          <p class="mt-1 whitespace-pre-wrap">来信：{{ item.text }}</p>
          <p v-if="item.draft" class="mt-1 whitespace-pre-wrap text-teal-700">
            草稿：{{ item.draft }}
          </p>
          <p v-if="item.error" class="mt-1 text-red-600">{{ item.error }}</p>
          <div class="mt-2 flex gap-2">
            <UButton
              size="xs"
              :loading="generatingKey === draftKey(item)"
              @click="generateDraft(item)"
            >
              {{ item.draft ? '重新生成' : '生成 AI 草稿' }}
            </UButton>
            <UButton v-if="item.draft" size="xs" variant="outline" @click="copyDraft(item.draft)"
              >复制草稿</UButton
            >
          </div>
        </div>
      </div>
    </UFormField>

    <LLMPromptEdit
      v-if="aiBoxShow && aiBox !== 'record'"
      v-model="aiBoxShow"
      :key="aiBox"
      :data="aiBox"
    />
  </div>
</template>
