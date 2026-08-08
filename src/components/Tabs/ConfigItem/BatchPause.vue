<script lang="ts" setup>
import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

const conf = useConf()
const helper = useHelper()
const config = conf.formData.batchPause

/** 保证次数范围有序，避免导入或手工输入造成负数/反向范围。 */
function normalizeCountRange() {
  config.afterMin = Math.max(1, Math.min(500, Math.round(Number(config.afterMin) || 1)))
  config.afterMax = Math.max(
    config.afterMin,
    Math.min(500, Math.round(Number(config.afterMax) || config.afterMin)),
  )
}

/** 将长等待范围限制在用户要求的 1～4 分钟。 */
function normalizeWaitRange() {
  config.waitMinSeconds = Math.max(
    60,
    Math.min(240, Math.round(Number(config.waitMinSeconds) || 60)),
  )
  config.waitMaxSeconds = Math.max(
    config.waitMinSeconds,
    Math.min(240, Math.round(Number(config.waitMaxSeconds) || config.waitMinSeconds)),
  )
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <UAlert
      color="warning"
      variant="subtle"
      title="投递批次长等待"
      description="默认关闭。每完成随机 X～Y 次实际成功投递后，随机等待 1～4 分钟；这是节奏控制，不保证规避平台风控。"
    />
    <UCheckbox
      v-model="config.enable"
      label="启用投递批次长等待"
      :disabled="helper.workflowRunning.value"
    />
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2" :class="{ 'opacity-60': !config.enable }">
      <UFormField label="触发次数（次）">
        <div class="flex items-center gap-2">
          <UInputNumber
            v-model="config.afterMin"
            :min="1"
            :max="500"
            :disabled="!config.enable || helper.workflowRunning.value"
            @blur="normalizeCountRange"
          />
          <span>至</span>
          <UInputNumber
            v-model="config.afterMax"
            :min="1"
            :max="500"
            :disabled="!config.enable || helper.workflowRunning.value"
            @blur="normalizeCountRange"
          />
        </div>
      </UFormField>
      <UFormField label="长等待（秒）">
        <div class="flex items-center gap-2">
          <UInputNumber
            v-model="config.waitMinSeconds"
            :min="60"
            :max="240"
            :disabled="!config.enable || helper.workflowRunning.value"
            @blur="normalizeWaitRange"
          />
          <span>至</span>
          <UInputNumber
            v-model="config.waitMaxSeconds"
            :min="60"
            :max="240"
            :disabled="!config.enable || helper.workflowRunning.value"
            @blur="normalizeWaitRange"
          />
        </div>
      </UFormField>
    </div>
  </div>
</template>
