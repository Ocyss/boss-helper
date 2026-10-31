<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  text: string
  greeting?: string
  streaming?: boolean
}>()

const result = computed(() => {
  const text = props.text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1')
  try {
    const data: unknown = JSON.parse(text)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const value = data as Record<string, unknown>
    if (!['greeting', 'reason', 'abilities', 'error'].some((key) => key in value)) return null
    return {
      greeting: typeof value.greeting === 'string' ? value.greeting : '',
      reason: typeof value.reason === 'string' ? value.reason : '',
      error: typeof value.error === 'string' ? value.error : '',
      abilities: Array.isArray(value.abilities)
        ? value.abilities.filter((ability): ability is string => typeof ability === 'string')
        : [],
    }
  } catch {
    return null
  }
})
const pendingJson = computed(() => props.streaming && /^(?:\{|```)/.test(props.text.trim()))
</script>

<template>
  <div v-if="result" class="min-w-0 space-y-3">
    <UAlert v-if="result.error" color="error" variant="soft" :description="result.error" />
    <div v-if="greeting ?? result.greeting" class="rounded-lg bg-elevated p-2">
      <p class="mb-2 text-xs font-medium text-muted">招呼语</p>
      <p class="whitespace-pre-wrap wrap-anywhere text-sm">{{ greeting ?? result.greeting }}</p>
    </div>
    <div v-if="result.reason">
      <p class="mb-1 text-xs font-medium text-muted">分析原因</p>
      <p class="whitespace-pre-wrap wrap-anywhere text-sm">{{ result.reason }}</p>
    </div>
    <div v-if="result.abilities.length" class="flex flex-wrap gap-1">
      <UBadge
        v-for="(ability, index) in result.abilities"
        :key="index"
        variant="subtle"
        color="warning"
      >
        {{ ability }}
      </UBadge>
    </div>
  </div>
  <p v-else-if="pendingJson" class="text-sm text-muted" role="status">正在生成，请稍候…</p>
  <p v-else class="whitespace-pre-wrap wrap-anywhere text-sm">{{ greeting ?? text }}</p>
</template>
