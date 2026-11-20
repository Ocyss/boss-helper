<script lang="ts" setup>
import type { SelectMenuItem } from '@nuxt/ui'
import { computed, ref, watch } from 'vue'

import { useConf } from '@/composables/conf'
import { useModel } from '@/composables/useModel'
import { extractResumeText, structureResume } from '@/utils/resume'

const conf = useConf()
const model = useModel()
const toast = useToast()

const fileInput = ref<HTMLInputElement | null>(null)
const parsing = ref(false)
const structuring = ref(false)
const selectedModel = ref(conf.formData.aiGreeting.model ?? '')

const modelItems = computed(() => model.modelData.value as SelectMenuItem[])
const hasRaw = computed(() => Boolean(conf.formData.resume.raw.trim()))

watch(
  () => model.modelData.value.length,
  () => {
    if (!selectedModel.value && model.modelData.value[0]) {
      selectedModel.value = model.modelData.value[0].key
    }
  },
  { immediate: true },
)

function chooseFile() {
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  parsing.value = true
  try {
    const text = await extractResumeText(file)
    if (!text.trim()) throw new Error('没有解析到文字，可能是扫描版 PDF，请换一份或直接粘贴')
    conf.formData.resume.raw = text
    conf.formData.resume.updatedAt = Date.now()
    toast.add({ title: `已解析 ${file.name}，记得点「AI 提炼」或手动填写摘要`, color: 'success' })
  } catch (error) {
    toast.add({
      title: '简历解析失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    parsing.value = false
    input.value = ''
  }
}

async function structure() {
  const raw = conf.formData.resume.raw.trim()
  if (!raw) {
    toast.add({ title: '请先上传简历或粘贴原文', color: 'warning' })
    return
  }
  const modelConf = model.modelData.value.find((item) => item.key === selectedModel.value)
  if (!modelConf) {
    toast.add({ title: '请先选择模型；没有模型请到「提供商」中新建', color: 'warning' })
    return
  }
  structuring.value = true
  try {
    const result = await structureResume(raw, modelConf)
    Object.assign(conf.formData.resume, result, { updatedAt: Date.now() })
    toast.add({ title: '简历已提炼，请检查后保存配置', color: 'success' })
  } catch (error) {
    toast.add({
      title: 'AI 提炼失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    structuring.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center gap-3">
      <UButton icon="i-lucide-upload" :loading="parsing" @click="chooseFile">上传简历</UButton>
      <input
        ref="fileInput"
        type="file"
        accept=".pdf,.docx,.txt,.md"
        class="hidden"
        @change="onFile"
      />
      <span class="text-sm text-muted">支持 PDF / DOCX / TXT，本地解析，不上传原文件</span>
    </div>

    <UFormField label="简历摘要（会注入招呼语和匹配提示词）">
      <UTextarea
        v-model="conf.formData.resume.summary"
        :rows="6"
        autoresize
        class="w-full"
        placeholder="例如：5 年前端，主做 Vue/React 中后台与可视化，主导过日活 20 万的运营平台，首屏从 3.2s 降到 1.1s。"
      />
    </UFormField>

    <div class="grid grid-cols-2 gap-4">
      <UFormField label="核心技能（顿号或逗号分隔）">
        <UInput v-model="conf.formData.resume.skills" placeholder="Vue3、TypeScript、Node.js" />
      </UFormField>
      <UFormField label="工作年限">
        <UInput v-model="conf.formData.resume.years" placeholder="5 年" />
      </UFormField>
    </div>

    <UFormField label="代表项目（每行一个：项目｜职责｜量化成果）">
      <UTextarea
        v-model="conf.formData.resume.projects"
        :rows="4"
        autoresize
        class="w-full"
        placeholder="运营平台｜前端负责人｜日活 20 万，首屏 3.2s→1.1s"
      />
    </UFormField>

    <div class="flex flex-wrap items-center gap-3">
      <USelectMenu
        v-model="selectedModel"
        :items="modelItems"
        label-key="name"
        value-key="key"
        placeholder="选择提炼模型"
        class="w-56"
      />
      <UButton :loading="structuring" :disabled="!hasRaw" @click="structure">AI 提炼</UButton>
      <span class="text-sm text-muted">只使用简历原文，不会编造经历</span>
    </div>

    <details class="rounded-lg border border-default p-3">
      <summary class="cursor-pointer text-sm text-muted">查看 / 编辑简历原文</summary>
      <UTextarea
        v-model="conf.formData.resume.raw"
        :rows="12"
        autoresize
        class="mt-3 w-full"
        placeholder="也可以直接把简历全文粘贴到这里"
      />
    </details>
  </div>
</template>
