<script lang="ts" setup>
import { InputMenuItem } from '@nuxt/ui'
import { reactive } from 'vue'

import LLMFormItem from '@/components/AI/LLMFormItem.vue'
import type { ModelConfData } from '@/composables/useModel'
import {
  getOpenaiFormInfo,
  isOpenCodeGoBaseUrl,
  normalizeOpenAiBaseUrl,
} from '@/composables/useModel/openai'

const formData = defineModel<ModelConfData>({ required: true })

const enabledFields = reactive<Record<string, boolean>>({})
const formInfo = computed(() => getOpenaiFormInfo(formData.value))
const isOpenCodeGo = computed(() =>
  isOpenCodeGoBaseUrl(normalizeOpenAiBaseUrl(formData.value.base_url ?? '')),
)

const initializeEnabledFields = () => {
  const info = formInfo.value
  for (const [key, item] of Object.entries(info)) {
    if (key === 'mode') continue
    const itemAny = item as any
    if (!itemAny.required && formData.value[key as keyof ModelConfData] !== undefined) {
      enabledFields[key] = true
    }
  }
}

initializeEnabledFields()

const llmFormRef = useTemplateRef('LLMFormRef')
provide('LLMFormRef', llmFormRef)

async function getIconGroups() {
  const baseUrl = 'https://testingcf.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/'
  const html = await fetch(baseUrl).then((res) => res.text())
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const result: Record<string, Record<string, string>> = {}
  doc.querySelectorAll('tr a').forEach((x) => {
    const name = x.textContent.trim()
    const match = name.match(/^(.+?)(?:-(color|text))?\.svg$/)

    if (match) {
      const [_, baseName, type = 'default'] = match
      if (!result[baseName]) result[baseName] = {}
      result[baseName][type] = `${baseUrl}${name}`
    }
  })
  return result
}

const iconGroups = ref<InputMenuItem[]>([])

onMounted(() => {
  getIconGroups().then((groups) => {
    iconGroups.value = Object.entries(groups).map(([key, value]) => {
      const avatar = value.color || value.default || ''
      return {
        label: key,
        value: avatar,
        avatar: {
          src: avatar,
          alt: key,
          loading: 'lazy',
        },
      }
    })
  })
})
</script>

<template>
  <div class="openai-form space-y-6" ref="LLMFormRef">
    <UAlert
      v-if="isOpenCodeGo"
      class="mb-4"
      color="info"
      variant="subtle"
      title="已识别 OpenCode Go 订阅"
      description="请填写 OpenCode Zen 控制台中的 API Key，并选择 Go 模型。不同模型会自动走 Responses、Chat Completions 或 Anthropic Messages。请求经扩展后台发出，避免 BOSS 页面跨域限制。"
    />
    <div v-for="(item, key) in formInfo" :key="key">
      <div v-if="'mode' in item" class="mb-2">
        <!-- <h3 class="text-lg font-semibold">
          {{ item.label || 'Configuration' }}
        </h3> -->
      </div>
      <div v-else-if="key == 'avatar'" class="border-b border-default pb-4 mb-4">
        <UFormField :required="true" :ui="{ container: 'flex flex-row gap-2' }" title="Avatar">
          <UInputMenu
            v-if="llmFormRef"
            v-model="formData['avatar']"
            :portal="llmFormRef"
            :clear="false"
            :items="iconGroups"
            :avatar="{
              src: formData['avatar'],
              alt: 'avatar',
              loading: 'lazy',
            }"
            valueKey="value"
            createItem
            @create="
              (x) => {
                formData['avatar'] = x
              }
            "
          />
        </UFormField>
      </div>
      <LLMFormItem v-else v-model="formData[key]" :info="item" :label="key" :depth="1" />
    </div>
  </div>
</template>

<style scoped>
.openai-form {
  --ring-color: color-mix(in oklab, var(--ui-primary) 25%, transparent);
}

.openai-form :deep(.rounded-xl) {
  transition: all 0.2s ease;
}

.openai-form :deep(.rounded-xl:focus-within) {
  box-shadow: 0 0 0 3px var(--ring-color);
}
</style>
