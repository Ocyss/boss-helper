<script lang="ts" setup>
import { computed, ref } from 'vue'

import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

import LLMPromptEdit from './AI/LLMPromptEdit.vue'

const conf = useConf()
const helper = useHelper()
const active = ref('aiGreeting')
const greetingEditor = ref<InstanceType<typeof LLMPromptEdit> | null>(null)
const filteringEditor = ref<InstanceType<typeof LLMPromptEdit> | null>(null)
const isDirty = computed(() =>
  Boolean(greetingEditor.value?.isDirty || filteringEditor.value?.isDirty),
)

async function save(options?: { silent?: boolean }): Promise<boolean> {
  for (const editor of [greetingEditor.value, filteringEditor.value]) {
    if (editor?.isDirty && !(await editor.save(options))) return false
  }
  return true
}

defineExpose({ save, isDirty })
const running = computed(() => helper.workflow?.status.value === 'running')
const items = [
  { label: '招呼语', value: 'aiGreeting', slot: 'greeting' as const },
  { label: '筛选', value: 'aiFiltering', slot: 'filtering' as const },
  { label: '回复（暂未开放）', value: 'aiReply', disabled: true },
]

async function toggle(data: 'aiGreeting' | 'aiFiltering', enabled: boolean) {
  conf.formData[data].enable = enabled
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4" data-help="AI 配置">
    <p class="text-sm text-muted">
      先在提供商管理中配置并保存模型，再分别设置招呼语和岗位筛选。修改后请点击页面底部保存；提示词也可单独保存。
    </p>
    <UTabs v-model="active" :items="items" :unmount-on-hide="false" class="w-full">
      <template #greeting>
        <div class="flex flex-col gap-4 pt-4">
          <USwitch
            :model-value="conf.formData.aiGreeting.enable"
            :disabled="running"
            label="启用 AI 招呼语"
            @update:model-value="toggle('aiGreeting', $event)"
          />
          <LLMPromptEdit ref="greetingEditor" data="aiGreeting" embedded />
        </div>
      </template>
      <template #filtering>
        <div class="flex flex-col gap-4 pt-4">
          <USwitch
            :model-value="conf.formData.aiFiltering.enable"
            :disabled="running"
            label="启用 AI 岗位筛选"
            @update:model-value="toggle('aiFiltering', $event)"
          />
          <LLMPromptEdit ref="filteringEditor" data="aiFiltering" embedded />
        </div>
      </template>
    </UTabs>
  </div>
</template>
