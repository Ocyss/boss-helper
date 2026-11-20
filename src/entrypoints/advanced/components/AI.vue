<script lang="ts" setup>
import { computed, ref } from 'vue'

import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

import LLMPromptEdit from './AI/LLMPromptEdit.vue'
import ResumeConfig from './AI/ResumeConfig.vue'

const conf = useConf()
const helper = useHelper()
const active = ref('aiGreeting')
const greetingEditor = ref<InstanceType<typeof LLMPromptEdit> | null>(null)
const isDirty = computed(() => Boolean(greetingEditor.value?.isDirty))

async function save(options?: { silent?: boolean }): Promise<boolean> {
  if (greetingEditor.value?.isDirty && !(await greetingEditor.value.save(options))) return false
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
const items = [
  { label: '招呼语', value: 'aiGreeting', slot: 'greeting' as const },
  { label: '简历', value: 'resume', slot: 'resume' as const },
]
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-4"
    data-help="AI 只负责生成招呼语；岗位筛选使用基础配置里的规则"
  >
    <p class="text-sm text-muted">
      AI 只负责生成招呼语，岗位筛选由「筛选配置」里的规则完成。提示词支持变量渲染，详见
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
          <USwitch v-model="greetingEnabled" :disabled="running" label="启用 AI 招呼语" />
          <LLMPromptEdit ref="greetingEditor" data="aiGreeting" />
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
