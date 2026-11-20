<script lang="ts" setup>
import { generateText } from 'ai'
import { computed, onMounted, ref } from 'vue'

import { useConf } from '@/composables/conf'
import { useModel } from '@/composables/useModel'
import { createModel } from '@/composables/useModel/providers'
import type { ModelConf, ModelConfData } from '@/composables/useModel/type'
import type { ResumeProfile } from '@/types/formData'
import { structureResume } from '@/utils/resume'

const conf = useConf()
const model = useModel()
const toast = useToast()

const apiKey = ref('')
const baseUrl = ref('https://api.deepseek.com/v1')
const modelId = ref('deepseek-chat')
const showOther = ref(false)
const testing = ref(false)
const saving = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const activeId = ref('')
const autoSelect = ref(true)
const refiningId = ref('')

const profiles = computed(() => conf.formData.resumeProfiles)
const modelReady = computed(
  () => Boolean(conf.formData.aiGreeting.enable && conf.formData.aiGreeting.model),
)

onMounted(async () => {
  await conf.confInit()
  await model.initModel()
  const existing = model.modelData.value.find((item) => item.key === 'simple-default')
  if (existing?.data) {
    apiKey.value = existing.data.api_key
    baseUrl.value = existing.data.base_url || baseUrl.value
    modelId.value = existing.data.model || modelId.value
  }
  const storedId = conf.formData.activeResumeId
  activeId.value = profiles.value.some((profile) => profile.id === storedId)
    ? storedId
    : profiles.value[0]?.id || ''
  autoSelect.value = conf.formData.autoSelectResume !== false
})

function buildModelData(): ModelConfData {
  return {
    base_url: baseUrl.value.trim(),
    api_key: apiKey.value.trim(),
    model: modelId.value.trim(),
    protocol: 'openai-compatible',
    advanced: {},
  }
}

async function testConnection() {
  if (!apiKey.value.trim() || !baseUrl.value.trim() || !modelId.value.trim()) {
    toast.add({ title: '请先填写 API Key、API 地址和模型 ID', color: 'warning' })
    return
  }
  testing.value = true
  try {
    const { text } = await generateText({
      model: createModel(buildModelData()),
      prompt: '只回复 OK',
    })
    toast.add({
      title: '连接成功',
      description: text.trim().slice(0, 40) || 'OK',
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: '连接失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    testing.value = false
  }
}

async function saveModel() {
  if (!apiKey.value.trim()) {
    toast.add({ title: '请先填写 API Key', color: 'warning' })
    return
  }
  saving.value = true
  try {
    const data = buildModelData()
    const existing = model.modelData.value.find((item) => item.key === 'simple-default')
    if (existing) {
      existing.name = 'DeepSeek'
      existing.data = data
    } else {
      const confItem: ModelConf = {
        key: 'simple-default',
        name: 'DeepSeek',
        color: '#0ea5e9',
        data,
      }
      model.modelData.value.push(confItem)
    }
    await model.saveModel({ silent: true })

    conf.formData.aiGreeting.enable = true
    conf.formData.aiGreeting.model = 'simple-default'
    conf.formData.aiFiltering.enable = false
    await conf.confSaving({ silent: true })
    toast.add({ title: '已保存，可以上传简历了', color: 'success' })
  } finally {
    saving.value = false
  }
}

function pickFiles() {
  fileInput.value?.click()
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  uploading.value = true
  try {
    for (const file of files) {
      const text = (await file.text()).trim()
      if (!text) continue
      const name = file.name.replace(/\.(md|markdown|txt)$/i, '')
      const plain = text
        .replace(/^#{1,6}\s*/gm, '')
        .replace(/[*_`>]/g, '')
        .trim()
      const profile: ResumeProfile = {
        id: crypto.randomUUID(),
        name,
        keywords: name,
        raw: text,
        summary: plain.slice(0, 1500),
        skills: '',
        years: '',
        projects: '',
        updatedAt: Date.now(),
        enable: true,
      }
      const modelConf = model.modelData.value.find((item) => item.key === 'simple-default')
      if (modelConf?.data) {
        try {
          Object.assign(profile, await structureResume(text, modelConf))
        } catch {
          // 提炼失败时保留原文摘要，不阻塞上传
        }
      }
      conf.formData.resumeProfiles.push(profile)
      if (!activeId.value) activeId.value = profile.id
    }
    await saveProfiles()
    toast.add({ title: `已添加 ${files.length} 份简历`, color: 'success' })
  } catch (error) {
    toast.add({
      title: '简历解析失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function saveProfiles() {
  conf.formData.activeResumeId = activeId.value
  conf.formData.autoSelectResume = autoSelect.value
  const active = profiles.value.find((item) => item.id === activeId.value) ?? profiles.value[0]
  if (active) {
    conf.formData.resume = {
      raw: active.raw,
      summary: active.summary,
      skills: active.skills,
      years: active.years,
      projects: active.projects,
      updatedAt: active.updatedAt,
    }
  }
  await conf.confSaving({ silent: true })
}

async function setDefault(profile: ResumeProfile) {
  activeId.value = profile.id
  await saveProfiles()
  toast.add({ title: `默认简历：${profile.name}`, color: 'success' })
}

async function removeProfile(profile: ResumeProfile) {
  const index = conf.formData.resumeProfiles.indexOf(profile)
  if (index < 0) return
  conf.formData.resumeProfiles.splice(index, 1)
  if (activeId.value === profile.id) {
    activeId.value = conf.formData.resumeProfiles[0]?.id ?? ''
  }
  await saveProfiles()
}

async function refine(profile: ResumeProfile) {
  const modelConf = model.modelData.value.find((item) => item.key === 'simple-default')
  if (!modelConf?.data) {
    toast.add({ title: '请先保存 API Key', color: 'warning' })
    return
  }
  refiningId.value = profile.id
  try {
    const source = profile.raw.trim() || profile.summary.trim()
    Object.assign(profile, await structureResume(source, modelConf), { updatedAt: Date.now() })
    await saveProfiles()
    toast.add({ title: `已提炼：${profile.name}`, color: 'success' })
  } catch (error) {
    toast.add({
      title: '提炼失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    refiningId.value = ''
  }
}

function openJobs() {
  window.open('https://www.zhipin.com/web/geek/jobs', '_blank')
}

function openAdvanced() {
  window.open(chrome.runtime.getURL('advanced.html'), '_blank')
}
</script>

<template>
  <UApp>
    <div class="min-h-screen bg-default p-4 text-default sm:p-8">
      <div class="mx-auto flex max-w-3xl flex-col gap-5">
        <header class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold">Boss 求职助手</h1>
            <p class="mt-1 text-sm text-muted">只需 3 步：填 API Key → 上传简历 → 去职位页生成招呼语。</p>
          </div>
          <UBadge :color="modelReady ? 'success' : 'warning'" variant="subtle">
            {{ modelReady ? '模型已配置' : '待配置模型' }}
          </UBadge>
        </header>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <span class="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-white">1</span>
              <h2 class="font-semibold">填写 API Key</h2>
            </div>
          </template>
          <div class="flex flex-col gap-4">
            <UFormField label="DeepSeek API Key" description="默认使用 DeepSeek，保存后自动配置招呼语模型。">
              <UInput v-model="apiKey" type="password" placeholder="sk-..." class="w-full" />
            </UFormField>

            <UButton color="neutral" variant="ghost" size="xs" class="self-start" @click="showOther = !showOther">
              {{ showOther ? '收起其他模型设置' : '使用其他模型（可选）' }}
            </UButton>

            <div v-if="showOther" class="grid gap-3 sm:grid-cols-2">
              <UFormField label="API 地址">
                <UInput v-model="baseUrl" placeholder="https://api.deepseek.com/v1" class="w-full" />
              </UFormField>
              <UFormField label="模型 ID">
                <UInput v-model="modelId" placeholder="deepseek-chat" class="w-full" />
              </UFormField>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton :loading="saving" @click="saveModel">保存</UButton>
              <UButton color="neutral" variant="outline" :loading="testing" @click="testConnection">
                测试连接
              </UButton>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <span class="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-white">2</span>
              <h2 class="font-semibold">上传简历（.md，可多份）</h2>
            </div>
          </template>
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-3">
              <UButton :loading="uploading" @click="pickFiles">
                {{ uploading ? '解析并提炼中…' : '选择 .md 简历' }}
              </UButton>
              <input ref="fileInput" type="file" accept=".md,.markdown,.txt" multiple class="hidden" @change="onFiles" />
              <span class="text-sm text-muted">文件名会作为简历名称，上传后自动提炼摘要</span>
            </div>

            <div class="flex items-center gap-2">
              <USwitch v-model="autoSelect" />
              <span class="text-sm">按岗位关键词自动选择简历</span>
            </div>

            <div v-if="!profiles.length" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
              还没有简历。上传一份「前端.md」或「AI 应用.md」开始。
            </div>

            <div v-for="profile in profiles" :key="profile.id" class="rounded-lg border border-default p-3">
              <div class="flex flex-wrap items-center gap-2">
                <UInput v-model="profile.name" class="w-40" />
                <UBadge v-if="profile.id === activeId" color="success" variant="subtle">默认</UBadge>
                <div class="ml-auto flex gap-2">
                  <UButton size="xs" color="neutral" variant="subtle" @click="setDefault(profile)">设为默认</UButton>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="subtle"
                    :loading="refiningId === profile.id"
                    @click="refine(profile)"
                  >
                    AI 提炼
                  </UButton>
                  <UButton size="xs" color="error" variant="subtle" @click="removeProfile(profile)">删除</UButton>
                </div>
              </div>
              <UFormField label="岗位关键词（自动选择用）" class="mt-3">
                <UInput v-model="profile.keywords" placeholder="前端,Vue,React" class="w-full" />
              </UFormField>
              <p class="mt-2 line-clamp-2 text-sm text-muted">{{ profile.summary }}</p>
            </div>

            <UButton v-if="profiles.length" color="neutral" variant="outline" @click="saveProfiles">
              保存简历配置
            </UButton>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <span class="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-white">3</span>
              <h2 class="font-semibold">去职位页生成招呼语</h2>
            </div>
          </template>
          <div class="flex flex-col gap-3">
            <p class="text-sm text-muted">
              打开 BOSS 职位页后，在右侧面板点「开始筛选并生成」。只会生成招呼语草稿，不会自动发送；生成后到「待发」逐条确认。
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton @click="openJobs">打开 BOSS 职位页</UButton>
              <UButton color="neutral" variant="outline" @click="openAdvanced">高级设置</UButton>
            </div>
          </div>
        </UCard>

        <footer class="pb-6 text-center text-xs text-muted">
          简历和 API Key 只保存在本机浏览器；调用模型时会把简历与 JD 发给你配置的服务商。
        </footer>
      </div>
    </div>
  </UApp>
</template>
