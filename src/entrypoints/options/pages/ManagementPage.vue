<script setup lang="ts">
defineProps<{
  busy: boolean
  formDataPresets: { label: string; value: string }[]
  accounts: { label: string; value: string; preset: string }[]
  activeAccount: string
}>()
const emit = defineEmits<{
  createPreset: []
  deletePreset: [value: string, label: string]
  createAccount: []
  deleteAccount: [value: string, label: string]
  setDefaultPreset: [value: string, preset: string]
}>()
</script>

<template>
  <div class="space-y-5">
    <p class="text-sm text-muted">管理操作即时保存；默认预设和默认账号不可删除。</p>
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-semibold">预设管理</h2>
          <UButton
            label="创建预设"
            icon="i-lucide-plus"
            :disabled="busy"
            @click="emit('createPreset')"
          />
        </div>
      </template>
      <div class="divide-y divide-default">
        <div
          v-for="preset in formDataPresets"
          :key="preset.value"
          class="flex items-center justify-between gap-3 py-3"
        >
          <span class="min-w-0 wrap-break-words">{{ preset.label }}</span>
          <UButton
            label="删除"
            color="error"
            variant="ghost"
            :disabled="busy || preset.value === 'default'"
            @click="emit('deletePreset', preset.value, preset.label)"
          />
        </div>
      </div>
    </UCard>
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-semibold">账号管理</h2>
          <UButton
            label="创建账号"
            icon="i-lucide-plus"
            :disabled="busy"
            @click="emit('createAccount')"
          />
        </div>
      </template>
      <div class="divide-y divide-default">
        <div
          v-for="account in accounts"
          :key="account.value"
          class="flex flex-wrap items-center gap-3 py-3"
        >
          <span class="min-w-0 flex-1 wrap-break-wor">{{ account.label }}</span>
          <UBadge v-if="account.value === activeAccount" color="neutral" variant="soft"
            >当前账号</UBadge
          >
          <USelect
            :model-value="account.preset"
            :items="formDataPresets"
            :aria-label="`${account.label}的默认预设`"
            :disabled="busy"
            class="w-48"
            @update:model-value="emit('setDefaultPreset', account.value, $event)"
          />
          <UButton
            label="删除"
            color="error"
            variant="ghost"
            :disabled="busy || account.value === 'default'"
            @click="emit('deleteAccount', account.value, account.label)"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
