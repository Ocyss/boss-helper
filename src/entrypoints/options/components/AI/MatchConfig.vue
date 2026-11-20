<script lang="ts" setup>
import type { SelectMenuItem } from '@nuxt/ui'
import { computed } from 'vue'

import { useConf } from '@/composables/conf'
import { useModel } from '@/composables/useModel'

const conf = useConf()
const model = useModel()

const modelItems = computed(() => model.modelData.value as SelectMenuItem[])

const systemPrompt = computed({
  get: () => conf.formData.aiMatch.prompt[0]?.content ?? '',
  set: (value: string) => {
    if (conf.formData.aiMatch.prompt[0]) conf.formData.aiMatch.prompt[0].content = value
  },
})
const userPrompt = computed({
  get: () => conf.formData.aiMatch.prompt[1]?.content ?? '',
  set: (value: string) => {
    if (conf.formData.aiMatch.prompt[1]) conf.formData.aiMatch.prompt[1].content = value
  },
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-2">
      <USwitch v-model="conf.formData.aiMatch.enable" label="启用简历匹配度过滤" />
      <p class="text-sm text-muted">
        投递前让模型对比简历与 JD 打分，低于阈值的岗位直接跳过。需要先在「简历」页填写或上传简历。
      </p>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <UFormField label="匹配模型">
        <USelectMenu
          v-model="conf.formData.aiMatch.model"
          :items="modelItems"
          label-key="name"
          value-key="key"
          placeholder="选择模型"
        />
      </UFormField>
      <UFormField label="最低匹配分">
        <UInputNumber
          v-model="conf.formData.aiMatch.threshold"
          :min="0"
          :max="100"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField label="系统提示词">
      <UTextarea v-model="systemPrompt" :rows="9" autoresize class="w-full" />
    </UFormField>

    <UFormField label="用户提示词">
      <UTextarea v-model="userPrompt" :rows="9" autoresize class="w-full" />
    </UFormField>

    <p class="text-sm text-muted">
      可用变量：<code v-text="'{{ resume.summary }}'" />、<code v-text="'{{ resume.skills }}'" />、<code v-text="'{{ resume.years }}'" />、<code v-text="'{{ resume.projects }}'" />，以及岗位字段
      <code v-text="'{{ jobData.* }}'" />。
    </p>
  </div>
</template>
