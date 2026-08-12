<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'

import { useConf } from '@/composables/conf'
import { counter } from '@/message'
import type {
  BossReplyMode,
  CandidateKnowledgeItem,
  CandidateKnowledgeTaskAccess,
  CandidateProfileConfig,
} from '@/types/aiReply'
import type { Prompt } from '@/types/formData'
import {
  BOSS_REPLY_MARKDOWN_MAX_BYTES,
  BOSS_REPLY_MARKDOWN_MAX_KNOWLEDGE_ITEMS,
  parseBossReplyMarkdown,
} from '@/utils/bossReplyMarkdown'
import type { BossReplyMarkdownImport } from '@/utils/bossReplyMarkdown'
import {
  normalizeCandidateKnowledgeItem,
  normalizeCandidateProfile,
} from '@/utils/candidateProfile'
import { jsonClone } from '@/utils/deepmerge'

interface KnowledgeDraft extends Omit<CandidateKnowledgeItem, 'keywords'> {
  keywordsText: string
}

interface MarkdownImportPreview {
  fileName: string
  data: BossReplyMarkdownImport
  importKnowledge: boolean
  replaceSystemPrompt: boolean
  replaceUserPrompt: boolean
  confirmKnowledge: boolean
  overwriteConflicts: boolean
  importTasks: CandidateKnowledgeTaskAccess
  autoReplyAllowed: boolean
}

const show = defineModel<boolean>({ required: true })
const conf = useConf()
const toast = useToast()

const modeItems = [
  { label: '仅生成草稿（推荐先使用）', value: 'draft' },
  { label: 'HR 新消息校验通过后自动发送', value: 'auto' },
]
const mode = ref<BossReplyMode>(normalizeReplyMode(conf.formData.aiReply.mode))
const partialReplyEnabled = ref(conf.formData.aiReply.partialReplyEnabled !== false)
const browserNotification = ref(conf.formData.aiReply.browserNotification)
const feishuNotification = ref(conf.formData.aiReply.feishuNotification)
const sendDelaySeconds = ref(conf.formData.aiReply.sendDelaySeconds)
const maxReplyLength = ref(conf.formData.aiReply.maxReplyLength)
const prompt = ref<Prompt>(jsonClone(conf.formData.aiReply.prompt))
const candidateProfile = normalizeCandidateProfile(conf.formData.candidateProfile)
const policies = ref<CandidateProfileConfig['policies']>(jsonClone(candidateProfile.policies))
const knowledge = ref<KnowledgeDraft[]>(
  jsonClone(candidateProfile.knowledge).map((rawItem) => {
    const item = normalizeCandidateKnowledgeItem(rawItem)
    return {
      ...item,
      keywordsText: Array.isArray(item.keywords) ? item.keywords.join('，') : '',
    }
  }),
)
const retrievalModeItems = [
  { label: '按关键词相关度', value: 'keyword' },
  { label: '按配置顺序', value: 'all' },
]
const policyItems = [
  { key: 'filtering' as const, label: 'AI 筛选' },
  { key: 'greeting' as const, label: 'AI 招呼' },
  { key: 'reply' as const, label: 'AI 回复' },
]

const feishuConfigEnabled = ref(false)
const feishuConfigReady = ref(false)
const saving = ref(false)
const feishuStatusLoading = ref(false)
const markdownFileInput = ref<HTMLInputElement>()
const markdownPreview = ref<MarkdownImportPreview>()
const replySettingsBodyRef = ref<HTMLElement>()

function normalizeReplyMode(value: unknown): BossReplyMode {
  if (value === 'auto') return 'auto'
  if (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    (value as { value?: unknown }).value === 'auto'
  ) {
    return 'auto'
  }
  return 'draft'
}

function normalizeKnowledgeId(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

const markdownConflicts = computed(() => {
  if (!markdownPreview.value) return []
  const existingById = new Map(
    knowledge.value.map((item) => [normalizeKnowledgeId(item.id), item] as const),
  )
  return markdownPreview.value.data.knowledge.filter((item) => {
    const existing = existingById.get(normalizeKnowledgeId(item.id))
    if (!existing) return false
    return (
      existing.title.trim() !== item.title.trim() || existing.content.trim() !== item.content.trim()
    )
  })
})

function addKnowledge(): void {
  knowledge.value.push({
    id: `knowledge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    content: '',
    keywordsText: '',
    enabled: true,
    confirmed: false,
    tasks: {
      filtering: false,
      greeting: false,
      reply: true,
    },
    autoReplyAllowed: false,
    source: '',
    confirmedAt: '',
    validUntil: '',
  })
}

function removeKnowledge(index: number): void {
  knowledge.value.splice(index, 1)
}

function toKnowledgeItems(): CandidateKnowledgeItem[] {
  if (knowledge.value.length > BOSS_REPLY_MARKDOWN_MAX_KNOWLEDGE_ITEMS) {
    throw new Error(`知识库不能超过 ${BOSS_REPLY_MARKDOWN_MAX_KNOWLEDGE_ITEMS} 条`)
  }
  const ids = new Set<string>()
  return knowledge.value.map((item) => {
    const id = normalizeKnowledgeId(item.id)
    if (!id) throw new Error('知识 ID 不能为空')
    if (ids.has(id)) throw new Error(`知识库存在重复 ID：[${id}]`)
    if (!item.title.trim()) throw new Error(`[${id}] 标题不能为空`)
    if (!item.content.trim()) throw new Error(`[${id}] 正文不能为空`)
    if (Array.from(item.title.trim()).length > 100) throw new Error(`[${id}] 标题不能超过 100 字`)
    if (Array.from(item.content.trim()).length > 2000) {
      throw new Error(`[${id}] 正文不能超过 2000 字`)
    }
    ids.add(id)

    const normalized = normalizeCandidateKnowledgeItem({
      id,
      title: item.title.trim(),
      content: item.content.trim(),
      keywords: item.keywordsText
        .split(/[，,]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      enabled: item.enabled,
      confirmed: item.confirmed,
      tasks: {
        filtering: item.tasks.filtering,
        greeting: item.tasks.greeting,
        reply: item.tasks.reply,
      },
      autoReplyAllowed: item.tasks.reply && item.autoReplyAllowed,
      source: item.source.trim(),
      confirmedAt: item.confirmedAt,
      validUntil: item.validUntil,
    })
    if (item.confirmedAt && !normalized.confirmedAt) throw new Error(`[${id}] 确认日期无效`)
    if (item.validUntil && !normalized.validUntil) throw new Error(`[${id}] 有效期无效`)
    return normalized
  })
}

function openMarkdownFile(): void {
  markdownFileInput.value?.click()
}

async function onMarkdownFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    if (!file.name.toLowerCase().endsWith('.md')) throw new Error('请选择 .md 文件')
    if (file.size > BOSS_REPLY_MARKDOWN_MAX_BYTES) {
      throw new Error(`Markdown 文件不能超过 ${BOSS_REPLY_MARKDOWN_MAX_BYTES / 1024} KiB`)
    }
    const data = parseBossReplyMarkdown(await file.text())
    markdownPreview.value = {
      fileName: file.name,
      data,
      importKnowledge: data.knowledge.length > 0,
      replaceSystemPrompt: false,
      replaceUserPrompt: false,
      confirmKnowledge: false,
      overwriteConflicts: false,
      importTasks: {
        filtering: false,
        greeting: false,
        reply: true,
      },
      autoReplyAllowed: false,
    }
  } catch (error) {
    markdownPreview.value = undefined
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

function replacePromptMessage(role: 'system' | 'user', content: string): void {
  const nextMessage = { role, content } as const
  const remainingMessages = prompt.value.filter((message) => message.role !== role)

  // 系统约束始终置顶；用户载荷放在末尾，避免遗留同角色消息继续影响模型。
  prompt.value =
    role === 'system' ? [nextMessage, ...remainingMessages] : [...remainingMessages, nextMessage]
}

function applyMarkdownImport(): void {
  const preview = markdownPreview.value
  if (!preview) return

  try {
    if (!preview.importKnowledge && !preview.replaceSystemPrompt && !preview.replaceUserPrompt) {
      throw new Error('请至少选择一项导入内容')
    }
    if (preview.importKnowledge && !preview.confirmKnowledge) {
      throw new Error('请先逐项预览，并勾选“已人工核对全部知识卡片”')
    }
    if (
      preview.importKnowledge &&
      markdownConflicts.value.length > 0 &&
      !preview.overwriteConflicts
    ) {
      throw new Error('存在同 ID 不同内容的知识卡片，请明确允许覆盖或取消导入')
    }

    if (preview.importKnowledge) {
      const configureImportedItem = (item: CandidateKnowledgeItem): KnowledgeDraft => ({
        ...normalizeCandidateKnowledgeItem(item),
        tasks: { ...preview.importTasks },
        autoReplyAllowed: preview.autoReplyAllowed,
        enabled: true,
        confirmed: true,
        keywordsText: item.keywords.join('，'),
      })
      const importedById = new Map(
        preview.data.knowledge.map((item) => {
          const id = normalizeKnowledgeId(item.id)
          return [id, configureImportedItem({ ...item, id })] as const
        }),
      )
      const existingIds = new Set(knowledge.value.map((item) => normalizeKnowledgeId(item.id)))
      const mergedKnowledge = knowledge.value.map((existing) => {
        const existingId = normalizeKnowledgeId(existing.id)
        const imported = importedById.get(existingId)
        if (!imported) return { ...existing, id: existingId }

        const hasSameContent =
          existing.title.trim() === imported.title.trim() &&
          existing.content.trim() === imported.content.trim()
        if (hasSameContent) {
          return {
            ...existing,
            id: existingId,
            enabled: true,
            confirmed: true,
            tasks: { ...preview.importTasks },
            autoReplyAllowed: preview.autoReplyAllowed,
          }
        }

        return imported
      })
      mergedKnowledge.push(
        ...preview.data.knowledge
          .filter((item) => !existingIds.has(normalizeKnowledgeId(item.id)))
          .map((item) => configureImportedItem(item)),
      )
      if (mergedKnowledge.length > BOSS_REPLY_MARKDOWN_MAX_KNOWLEDGE_ITEMS) {
        throw new Error(`合并后知识库不能超过 ${BOSS_REPLY_MARKDOWN_MAX_KNOWLEDGE_ITEMS} 条`)
      }
      knowledge.value = mergedKnowledge
    }
    if (preview.replaceSystemPrompt && preview.data.systemPrompt) {
      replacePromptMessage('system', preview.data.systemPrompt)
    }
    if (preview.replaceUserPrompt && preview.data.userPrompt) {
      replacePromptMessage('user', preview.data.userPrompt)
    }

    toast.add({
      title: '已应用到当前弹窗，点击“保存”后才会写入配置',
      color: 'success',
    })
    markdownPreview.value = undefined
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function save(): Promise<void> {
  saving.value = true
  try {
    if (feishuNotification.value && (!feishuConfigReady.value || !feishuConfigEnabled.value)) {
      throw new Error('请先在扩展安全配置页启用并完成飞书配置')
    }
    Object.assign(conf.formData.aiReply, {
      mode: normalizeReplyMode(mode.value),
      partialReplyEnabled: partialReplyEnabled.value,
      browserNotification: browserNotification.value,
      feishuNotification: feishuNotification.value,
      sendDelaySeconds: Math.min(30, Math.max(0, sendDelaySeconds.value)),
      maxReplyLength: Math.min(1000, Math.max(20, maxReplyLength.value)),
      prompt: jsonClone(prompt.value),
    })
    conf.formData.candidateProfile = normalizeCandidateProfile({
      knowledge: toKnowledgeItems(),
      policies: jsonClone(policies.value),
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
    title="AI 回复策略与候选人事实"
    :dismissible="false"
    :ui="{ content: 'sm:max-w-3xl', body: 'space-y-5 max-h-[70vh] overflow-y-auto' }"
  >
    <template #body>
      <section ref="replySettingsBodyRef" class="space-y-3">
        <h3 class="font-medium">回复策略</h3>
        <UFormField label="执行模式">
          <USelectMenu
            v-model="mode"
            :items="modeItems"
            label-key="label"
            value-key="value"
            :portal="replySettingsBodyRef?.parentElement?.parentElement ?? false"
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
        <UCheckbox
          v-model="partialReplyEnabled"
          label="多问题中仅部分可答时，回复有依据的部分并告警人工处理其余问题"
        />
      </section>

      <section class="space-y-3 border-t border-default pt-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="font-medium">共享候选人事实库</h3>
            <p class="text-xs text-muted">
              只有同时启用、人工确认且授权给当前任务的事实才会注入模型；Markdown 知识卡使用“[K01]
              标题”格式。
            </p>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <input
              ref="markdownFileInput"
              type="file"
              accept=".md,text/markdown,text/plain"
              class="hidden"
              @change="onMarkdownFileChange"
            />
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-file-up"
              @click="openMarkdownFile"
            >
              导入 Markdown
            </UButton>
            <UButton size="sm" color="neutral" variant="outline" @click="addKnowledge">
              添加知识
            </UButton>
          </div>
        </div>

        <div
          v-if="markdownPreview"
          class="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-sm font-medium">导入预览：{{ markdownPreview.fileName }}</h4>
              <p class="text-xs text-muted">
                已识别 {{ markdownPreview.data.knowledge.length }}
                条知识卡片。此处应用后仍需点击底部“保存”。
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              title="取消本次导入"
              @click="markdownPreview = undefined"
            />
          </div>

          <div class="space-y-2 rounded-md border border-default bg-default p-3">
            <UCheckbox
              v-model="markdownPreview.importKnowledge"
              :label="`导入知识库（${markdownPreview.data.knowledge.length} 条）`"
            />
            <UCheckbox
              v-model="markdownPreview.replaceSystemPrompt"
              label="替换系统提示词（默认不替换）"
              :disabled="!markdownPreview.data.systemPrompt"
            />
            <UCheckbox
              v-model="markdownPreview.replaceUserPrompt"
              label="替换调用载荷提示词（默认不替换）"
              :disabled="!markdownPreview.data.userPrompt"
            />
            <div v-if="markdownPreview.importKnowledge" class="border-t border-default pt-2">
              <p class="mb-2 text-xs font-medium text-muted">导入知识适用任务</p>
              <div class="flex flex-wrap gap-4">
                <UCheckbox v-model="markdownPreview.importTasks.filtering" label="AI 筛选" />
                <UCheckbox v-model="markdownPreview.importTasks.greeting" label="AI 招呼" />
                <UCheckbox v-model="markdownPreview.importTasks.reply" label="AI 回复" />
                <UCheckbox
                  v-model="markdownPreview.autoReplyAllowed"
                  label="允许自动回复直接引用"
                  :disabled="!markdownPreview.importTasks.reply"
                />
              </div>
            </div>
          </div>

          <div v-if="markdownPreview.importKnowledge" class="max-h-64 space-y-2 overflow-y-auto">
            <div
              v-for="item in markdownPreview.data.knowledge"
              :key="item.id"
              class="rounded-md border border-default bg-default p-3"
            >
              <div class="text-sm font-medium">[{{ item.id }}] {{ item.title }}</div>
              <pre class="mt-1 whitespace-pre-wrap font-sans text-xs text-muted">{{
                item.content
              }}</pre>
            </div>
          </div>

          <div
            v-if="markdownPreview.importKnowledge && markdownConflicts.length > 0"
            class="space-y-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm"
          >
            <p>
              检测到同 ID 不同内容：{{ markdownConflicts.map((item) => item.id).join('、') }}。
              未明确同意前不会覆盖现有知识。
            </p>
            <UCheckbox
              v-model="markdownPreview.overwriteConflicts"
              label="允许用本文件内容覆盖上述冲突卡片"
            />
          </div>

          <UCheckbox
            v-if="markdownPreview.importKnowledge"
            v-model="markdownPreview.confirmKnowledge"
            label="我已逐项核对全部知识卡片，确认内容可用于上方选定的 AI 任务"
          />
          <div class="flex justify-end">
            <UButton size="sm" @click="applyMarkdownImport">应用所选内容</UButton>
          </div>
        </div>

        <div class="space-y-3 rounded-lg border border-default bg-muted/30 p-3">
          <div>
            <h4 class="text-sm font-medium">任务检索策略</h4>
            <p class="text-xs text-muted">
              每个任务只会从已授权事实中选取配置数量；按关键词无命中时保持配置顺序兜底。
            </p>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div
              v-for="policyItem in policyItems"
              :key="policyItem.key"
              class="space-y-2 rounded-md border border-default bg-default p-3"
            >
              <div class="text-sm font-medium">{{ policyItem.label }}</div>
              <UFormField label="检索方式">
                <USelectMenu
                  v-model="policies[policyItem.key].retrievalMode"
                  :items="retrievalModeItems"
                  label-key="label"
                  value-key="value"
                  :portal="replySettingsBodyRef?.parentElement?.parentElement ?? false"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="最多注入条数">
                <UInputNumber
                  v-model="policies[policyItem.key].maxKnowledgeItems"
                  :min="1"
                  :max="50"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
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
          <div class="grid gap-2 sm:grid-cols-3">
            <UInput v-model="item.source" placeholder="事实来源，例如：简历" />
            <UFormField label="确认日期">
              <UInput v-model="item.confirmedAt" type="date" class="w-full" />
            </UFormField>
            <UFormField label="有效期（留空为长期）">
              <UInput v-model="item.validUntil" type="date" class="w-full" />
            </UFormField>
          </div>
          <div class="flex flex-wrap gap-4 rounded-md bg-muted/40 p-2">
            <UCheckbox v-model="item.enabled" label="启用" />
            <UCheckbox v-model="item.confirmed" label="内容已人工确认" />
            <UCheckbox v-model="item.tasks.filtering" label="用于 AI 筛选" />
            <UCheckbox v-model="item.tasks.greeting" label="用于 AI 招呼" />
            <UCheckbox v-model="item.tasks.reply" label="用于 AI 回复" />
            <UCheckbox
              v-model="item.autoReplyAllowed"
              label="允许自动回复直接引用"
              :disabled="!item.tasks.reply"
            />
          </div>
        </div>
        <p v-if="knowledge.length === 0" class="text-sm text-muted">
          暂无候选人事实。AI 回复没有确定依据时必须拒答并转人工。
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
