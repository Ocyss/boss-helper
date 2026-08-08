<script lang="ts" setup>
import { formInfoData, useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

const conf = useConf()
const helper = useHelper()
const config = conf.formData.greetingFallback

/** 限制兜底文本长度，避免配置异常导致自动发送超长内容。 */
function normalizeFallback() {
  config.value = String(config.value ?? '').slice(0, 300)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <UAlert
      color="warning"
      variant="subtle"
      title="AI 招呼失败时的兜底文本"
      description="默认关闭。仅在模型未配置、请求异常、超时、空输出或返回“需人工判断”，且尚未发送外部消息时使用；BOSS 消息确认超时不会自动改发，避免重复触达。"
    />
    <UCheckbox
      v-bind="formInfoData.greetingFallback"
      v-model="config.enable"
      :disabled="helper.workflowRunning.value"
    />
    <UTextarea
      v-model="config.value"
      :disabled="!config.enable || helper.workflowRunning.value"
      :maxlength="300"
      :rows="3"
      autoresize
      :maxrows="6"
      placeholder="例如：您好，我有 AI Agent 与 LLM 应用落地经验，想进一步了解这个岗位的技术方向和团队安排。"
      @blur="normalizeFallback"
    />
    <p class="text-sm text-muted">
      发送前会限制为 1～150 字、最多 3
      句话；可配合“招呼语变量”使用岗位字段。兜底正文不会写入日志或统计。
    </p>
  </div>
</template>
