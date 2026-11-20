<script lang="ts" setup>
import { computed, ref } from 'vue'

import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

import LLMPromptEdit from './AI/LLMPromptEdit.vue'
import MatchConfig from './AI/MatchConfig.vue'
import ResumeConfig from './AI/ResumeConfig.vue'

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
const greetingEnabled = computed({
  get: () => conf.formData.aiGreeting.enable,
  set: (value: boolean) => {
    conf.formData.aiGreeting.enable = value
  },
})
const filteringEnabled = computed({
  get: () => conf.formData.aiFiltering.enable,
  set: (value: boolean) => {
    conf.formData.aiFiltering.enable = value
  },
})
const items = [
  { label: '招呼语', value: 'aiGreeting', slot: 'greeting' as const },
  { label: '筛选', value: 'aiFiltering', slot: 'filtering' as const },
  { label: '匹配', value: 'aiMatch', slot: 'match' as const },
  { label: '简历', value: 'resume', slot: 'resume' as const },
]
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-4"
    data-help="AI 配置, 使用AI招呼语之前推荐禁用boss自带招呼语"
  >
    <p class="text-sm text-muted">
      先在提供商管理中配置模型，再分别设置招呼语和岗位筛选。 提示词支持变量渲染，详见
      <ULink
        to="https://github.com/ocyss/boss-helper/blob/main/TEMPLATE_VARIABLES.md"
        target="_blank"
      >
        模板变量表 </ULink
      >。
    </p>
    <UTabs v-model="active" :items="items" :unmount-on-hide="false" class="w-full">
      <template #greeting>
        <div class="flex flex-col gap-4 pt-4">
          <USwitch
            v-model="greetingEnabled"
            :disabled="running"
            label="启用 AI 招呼语"
          />
          <LLMPromptEdit ref="greetingEditor" data="aiGreeting" />
        </div>
      </template>
      <template #filtering>
        <div class="flex flex-col gap-4 pt-4">
          <USwitch
            v-model="filteringEnabled"
            :disabled="running"
            label="启用 AI 岗位筛选"
          />
          <LLMPromptEdit ref="filteringEditor" data="aiFiltering" />
        </div>
      </template>
      <template #match>
        <div class="pt-4">
          <MatchConfig />
        </div>
      </template>
      <template #resume>
        <div class="pt-4">
          <ResumeConfig />
        </div>
      </template>
    </UTabs>
  </div>
</template>
