<script lang="ts" setup>
import { ref } from 'vue'

import LLMModelManage from '@/components/AI/LLMModelManage.vue'
import LLMPromptEdit from '@/components/AI/LLMPromptEdit.vue'
import TokenUsage from '@/components/AI/TokenUsage.vue'
import FormSwitch from '@/components/Tabs/ConfigItem/Form/FormSwitch.vue'
import { formInfoData, useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'
import type { FormDataAi } from '@/types/formData'

const helper = useHelper()
const conf = useConf()
const aiBoxShow = ref(false)
const aiConfBoxShow = ref(false)
const aiBox = ref<'aiGreeting' | 'aiFiltering' | 'aiReply' | 'record'>('aiGreeting')

function change(v: Partial<FormDataAi>) {
  v.enable = !v.enable
  conf.confSaving()
}
</script>

<template>
  <div class="flex flex-col gap-3" data-help="AI 配置">
    <div class="flex flex-wrap gap-3">
      <FormSwitch
        :label="formInfoData.aiGreeting.label"
        :data-help="formInfoData.aiGreeting['data-help']"
        :data="conf.formData.aiGreeting"
        :lock="helper.workflow?.status.value === 'running'"
        @show="
          () => {
            aiBox = 'aiGreeting'
            aiBoxShow = true
          }
        "
        @change="change"
      />
      <FormSwitch
        :label="formInfoData.aiFiltering.label"
        :data-help="formInfoData.aiFiltering['data-help']"
        :data="conf.formData.aiFiltering"
        :lock="helper.workflow?.status.value === 'running'"
        @show="
          () => {
            aiBox = 'aiFiltering'
            aiBoxShow = true
          }
        "
        @change="change"
      />
      <FormSwitch
        :label="formInfoData.aiReply.label"
        :data-help="formInfoData.aiReply['data-help']"
        :data="conf.formData.aiReply"
        disabled
        @show="
          () => {
            aiBox = 'aiReply'
            aiBoxShow = true
          }
        "
        @change="change"
      />
      <!-- <formSwitch
      v-bind="formInfoData.record"
      :data="formData.record"
      @show="
        aiBox = 'record';
        aiBoxShow = true;
      "
      @change="change"
    /> -->
    </div>
    <div class="flex flex-wrap gap-2">
      <LLMModelManage>
        <UButton
          color="primary"
          data-help="配置需要使用的LLM大模型"
          @click="
            () => {
              aiConfBoxShow = true
            }
          "
        >
          模型配置
        </UButton>
      </LLMModelManage>
      <TokenUsage>
        <UButton color="neutral" variant="outline" data-help="查看 AI 过滤与打招呼的 Token 消耗">
          Token 消耗
        </UButton>
      </TokenUsage>
    </div>

    <LLMPromptEdit
      v-if="aiBoxShow && aiBox !== 'record'"
      v-model="aiBoxShow"
      v-key="aiBox"
      :data="aiBox"
    />
  </div>
</template>
