<script lang="ts" setup>
import { onMounted, ref } from 'vue'

import { useConf } from '@/composables/conf'
import { counter } from '@/message'
import type { BossReplyKnowledgeItem, BossReplyMode } from '@/types/aiReply'
import { jsonClone } from '@/utils/deepmerge'

interface KnowledgeDraft extends Omit<BossReplyKnowledgeItem, 'keywords'> {
  keywordsText: string
}

const show = defineModel<boolean>({ required: true })
const conf = useConf()
const toast = useToast()

const modeItems = [
  { label: '仅生成草稿（推荐先使用）', value: 'draft' },
  { label: '校验通过后自动发送', value: 'auto' },
]
const mode = ref<BossReplyMode>(conf.formData.aiReply.mode)
const browserNotification = ref(conf.formData.aiReply.browserNotification)
const feishuNotification = ref(conf.formData.aiReply.feishuNotification)
const sendDelaySeconds = ref(conf.formData.aiReply.sendDelaySeconds)
const maxReplyLength = ref(conf.formData.aiReply.maxReplyLength)
const knowledge = ref<KnowledgeDraft[]>(
  jsonClone(
    Array.isArray(conf.formData.aiReply.knowledge) ? conf.formData.aiReply.knowledge : [],
  ).map((item) => ({
    ...item,
    keywordsText: Array.isArray(item.keywords) ? item.keywords.join('，') : '',
  })),
)

const feishuConfigEnabled = ref(false)
const feishuConfigReady = ref(false)
const saving = ref(false)
const feishuStatusLoading = ref(false)

function addKnowledge(): void {
  knowledge.value.push({
    id: `knowledge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    content: '',
    keywordsText: '',
    enabled: true,
    confirmed: false,
  })
}

function removeKnowledge(index: number): void {
  knowledge.value.splice(index, 1)
}

function toKnowledgeItems(): BossReplyKnowledgeItem[] {
  return knowledge.value.map((item) => ({
    id: item.id,
    title: item.title.trim(),
    content: item.content.trim(),
    keywords: item.keywordsText
      .split(/[，,]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    enabled: item.enabled,
    confirmed: item.confirmed,
  }))
}

async function save(): Promise<void> {
  saving.value = true
  try {
    if (feishuNotification.value && (!feishuConfigReady.value || !feishuConfigEnabled.value)) {
      throw new Error('请先在扩展安全配置页启用并完成飞书配置')
    }
    Object.assign(conf.formData.aiReply, {
      mode: mode.value,
      browserNotification: browserNotification.value,
      feishuNotification: feishuNotification.value,
      sendDelaySeconds: Math.min(30, Math.max(0, sendDelaySeconds.value)),
      maxReplyLength: Math.min(1000, Math.max(20, maxReplyLength.value)),
      knowledge: toKnowledgeItems(),
    })
    await conf.confSaving()
    show.value = false
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

async function refreshFeishuStatus(): Promise<void> {
  feishuStatusLoading.value = true
  try {
    const status = await counter.getFeishuNotificationStatus()
    feishuConfigEnabled.value = status.enabled
    feishuConfigReady.value = status.configured
  } catch (error) {
    toast.add({
      title: `读取飞书配置状态失败：${error instanceof Error ? error.message : String(error)}`,
      color: 'error',
    })
  } finally {
    feishuStatusLoading.value = false
  }
}

async function openFeishuOptions(): Promise<void> {
  try {
    await counter.openOptionsPage()
  } catch (error) {
    toast.add({
      title: `打开扩展配置页失败：${error instanceof Error ? error.message : String(error)}`,
      color: 'error',
    })
  }
}

onMounted(() => void refreshFeishuStatus())
</script>

<template>
  <UModal
    v-model:open="show"
    title="AI 回复策略与通知"
    :dismissible="false"
    :ui="{ content: 'sm:max-w-3xl', body: 'space-y-5 max-h-[70vh] overflow-y-auto' }"
  >
    <template #body>
      <section class="space-y-3">
        <h3 class="font-medium">回复策略</h3>
        <UFormField label="执行模式">
          <USelectMenu
            v-model="mode"
            :items="modeItems"
            label-key="label"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <UFormField label="自动发送前等待（秒）">
            <UInputNumber v-model="sendDelaySeconds" :min="0" :max="30" class="w-full" />
          </UFormField>
          <UFormField label="回复最大字数">
            <UInputNumber v-model="maxReplyLength" :min="20" :max="1000" class="w-full" />
          </UFormField>
        </div>
        <UCheckbox v-model="browserNotification" label="人工接管或草稿生成时显示浏览器通知" />
      </section>

      <section class="space-y-3 border-t border-default pt-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="font-medium">本地知识库</h3>
            <p class="text-xs text-muted">只有同时启用并确认的内容才允许成为回复证据。</p>
          </div>
          <UButton size="sm" color="neutral" variant="outline" @click="addKnowledge">
            添加知识
          </UButton>
        </div>

        <div
          v-for="(item, index) in knowledge"
          :key="item.id"
          class="space-y-2 rounded-lg border border-default p-3"
        >
          <div class="flex items-center gap-2">
            <UInput v-model="item.title" placeholder="标题，例如：到岗时间" class="flex-1" />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              title="删除"
              @click="removeKnowledge(index)"
            />
          </div>
          <UTextarea
            v-model="item.content"
            autoresize
            :rows="2"
            :maxrows="5"
            placeholder="只填写已经核实、允许 AI 对外表达的事实或规则"
            class="w-full"
          />
          <UInput
            v-model="item.keywordsText"
            placeholder="关键词，用逗号分隔，例如：到岗，入职"
            class="w-full"
          />
          <div class="flex flex-wrap gap-4">
            <UCheckbox v-model="item.enabled" label="启用" />
            <UCheckbox v-model="item.confirmed" label="内容已人工确认" />
          </div>
        </div>
        <p v-if="knowledge.length === 0" class="text-sm text-muted">
          暂无知识。没有确定依据时，AI 必须拒答并转人工。
        </p>
      </section>

      <section class="space-y-3 border-t border-default pt-4">
        <div>
          <h3 class="font-medium">飞书人工接管通知（可选）</h3>
          <p class="text-xs text-muted">
            App ID/App Secret 必须在扩展自己的安全配置页填写，不能在 BOSS 页面中输入。
          </p>
        </div>
        <UCheckbox v-model="feishuNotification" label="启用飞书人工接管通知" />
        <div class="rounded-lg border border-default bg-muted/40 p-3 text-sm">
          当前状态：
          <span :class="feishuConfigReady && feishuConfigEnabled ? 'text-success' : 'text-warning'">
            {{
              feishuConfigReady && feishuConfigEnabled
                ? '已配置并启用'
                : feishuConfigReady
                  ? '已配置但未启用'
                  : '尚未完成配置'
            }}
          </span>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :loading="feishuStatusLoading"
            @click="refreshFeishuStatus"
          >
            刷新状态
          </UButton>
          <UButton size="sm" color="neutral" variant="outline" @click="openFeishuOptions">
            打开扩展安全配置页
          </UButton>
        </div>
      </section>
    </template>

    <template #footer>
      <UButton color="neutral" variant="outline" @click="show = false">取消</UButton>
      <UButton :loading="saving" @click="save">保存</UButton>
    </template>
  </UModal>
</template>
