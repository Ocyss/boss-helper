<script lang="ts" setup>
import { computed, ref } from 'vue'

import type { ModelConfData, ModelAdvanced } from '@/composables/useModel'

const formData = defineModel<ModelConfData>({ required: true })
const advancedJson = ref(JSON.stringify(formData.value.advanced ?? {}, null, 2))
const showKey = ref(false)
const protocols = ['openai-compatible', 'openai-responses', 'anthropic-messages']
const protocolHelp = computed(
  () =>
    ({
      'openai-compatible': '使用 Chat Completions 接口，适用于大多数 OpenAI 兼容提供商。',
      'openai-responses': '使用 OpenAI Responses 接口，请确认提供商支持该协议。',
      'anthropic-messages': '使用 Anthropic Messages 接口，适用于 Claude 或支持该协议的代理。',
    })[formData.value.protocol],
)
const advancedError = computed(() => {
  try {
    const value = JSON.parse(advancedJson.value)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return '请输入 JSON 对象，例如 {}。'
    for (const key of ['headers', 'body']) {
      if (
        value[key] !== undefined &&
        (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key]))
      )
        return `${key} 必须是 JSON 对象。`
    }
    if (value.headers && Object.values(value.headers).some((v) => typeof v !== 'string'))
      return 'headers 的值必须是字符串。'
    return false
  } catch {
    return 'JSON 格式无效，请检查引号、逗号和括号。'
  }
})

function validate() {
  if (advancedError.value) return false
  formData.value.advanced = JSON.parse(advancedJson.value) as ModelAdvanced
  return true
}

const protocolPlaceholder = computed(
  () =>
    ({
      'openai-compatible': 'https://api.openai.com/v1',
      'openai-responses': 'https://api.openai.com/v1',
      'anthropic-messages': 'https://api.anthropic.com/v1',
    })[formData.value.protocol],
)
defineExpose({ validate })

const parentElement = useTemplateRef('parentElement')
</script>

<template>
  <div class="space-y-5" ref="parentElement">
    <UFormField orientation="vertical" label="接口协议" :description="protocolHelp" required>
      <USelect
        v-model="formData.protocol"
        :items="protocols"
        class="w-full"
        :portal="parentElement ?? undefined"
      />
    </UFormField>
    <UFormField
      label="API 地址"
      description="填写提供商给出的基础地址，不要附加 /chat/completions、/responses 或 /messages。"
      required
      orientation="vertical"
    >
      <UInput v-model="formData.base_url" :placeholder="protocolPlaceholder" class="w-full" />
    </UFormField>
    <UFormField
      label="API Key"
      description="从提供商控制台获取；本地服务不需要密钥时可留空。"
      orientation="vertical"
    >
      <UInput
        v-model="formData.api_key"
        :type="showKey ? 'text' : 'password'"
        autocomplete="off"
        placeholder="填写 API Key"
        class="w-full"
        :ui="{ trailing: 'pe-1' }"
      >
        <template #trailing>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :icon="showKey ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :aria-label="showKey ? '隐藏密钥' : '显示密钥'"
            @click="showKey = !showKey"
          />
        </template>
      </UInput>
    </UFormField>
    <UFormField
      label="模型 ID"
      description="与提供商控制台的模型名称保持一致，例如 deepseek-chat、gpt-4.1。"
      required
      orientation="vertical"
    >
      <UInput v-model="formData.model" placeholder="输入模型 ID" class="w-full" />
    </UFormField>
    <USeparator />
    <UFormField
      label="高级配置（可选）"
      description="默认 {}。headers 与 body 会深度合并到最终请求，同名值以这里为准，数组整体替换。"
      :error="advancedError"
      orientation="vertical"
    >
      <UTextarea
        v-model="advancedJson"
        :rows="5"
        :maxrows="12"
        autoresize
        spellcheck="false"
        class="w-full"
        :ui="{ base: 'font-mono' }"
      />
      <p class="mt-2 text-xs text-muted">
        示例：{"headers":{"X-Custom-Header":"value"},"body":{"temperature":0.7}}
      </p>
    </UFormField>
  </div>
</template>
