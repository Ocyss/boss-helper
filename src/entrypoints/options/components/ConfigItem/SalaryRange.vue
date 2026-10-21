<script lang="ts" setup>
import { formInfoData, useConf } from '@/composables/conf'

import FormRange from './Form/FormRange.vue'

const conf = useConf()

const salaryRangeAdvanced = ref(false)
const salaryRangeRef = ref()

function syncSalaryRange() {
  conf.formData.salaryRange.advancedValue.M[0] = Math.round(
    conf.formData.salaryRange.value[0] * 1000,
  )
  conf.formData.salaryRange.advancedValue.M[1] = Math.round(
    conf.formData.salaryRange.value[1] * 1000,
  )

  conf.formData.salaryRange.advancedValue.D[0] = Math.round(
    conf.formData.salaryRange.advancedValue.M[0] / 21.75,
  )
  conf.formData.salaryRange.advancedValue.D[1] = Math.round(
    conf.formData.salaryRange.advancedValue.M[1] / 21.75,
  )

  conf.formData.salaryRange.advancedValue.H[0] = Math.round(
    conf.formData.salaryRange.advancedValue.D[0] / 8,
  )
  conf.formData.salaryRange.advancedValue.H[1] = Math.round(
    conf.formData.salaryRange.advancedValue.D[1] / 8,
  )
}
</script>

<template>
  <FormItem
    label="薪资范围"
    data-help="投递工作的薪资范围, 更多选项可看高级配置"
    v-model:enable="conf.formData.salaryRange.enable"
    class="col-span-2 xl:col-span-1"
    ref="salaryRangeRef"
  >
    <FormRange :value="conf.formData.salaryRange.value" unit="K" :show="false">
      <UButton
        v-if="conf.configLevel.advanced"
        @click="
          () => {
            salaryRangeAdvanced = !salaryRangeAdvanced
          }
        "
      >
        高级
      </UButton>
    </FormRange>
    <UPopover
      :reference="salaryRangeRef"
      :open="salaryRangeAdvanced"
      placement="top"
      trigger="click"
    >
      <template #content>
        <div class="p-3 flex flex-col gap-3 max-w-85">
          <UAlert
            title="宽松匹配: 薪资范围有任何重叠即匹配, 如10-20K: 15-20K, 15-21k, 20-26k 都满足, 21-22k 不满足"
            color="info"
            :close="false"
          />
          <UAlert
            title="严格匹配: 目标薪资需完全在职位范围内, 如10-20K: 10-15K 和15-20K 满足, 15-21k 不满足"
            color="info"
            :close="false"
          />
          <FormRange
            :value="conf.formData.salaryRange.value"
            unit="K"
            :show="true"
            :ui="{ base: 'max-w-20' }"
          />
          <UAlert
            title="计算值进行同步，算法固定. 日薪: /21.75, 时薪: /21.75/8"
            color="info"
            :close="false"
          />
          <UButton @click="syncSalaryRange"> 同步 </UButton>
          <FormRange
            :value="conf.formData.salaryRange.advancedValue.H"
            unit="元/时"
            :show="true"
            :step="5"
            :ui="{ base: 'max-w-20' }"
          />
          <FormRange
            :value="conf.formData.salaryRange.advancedValue.D"
            unit="元/天"
            :show="true"
            :step="10"
            :ui="{ base: 'max-w-20' }"
          />
          <FormRange
            :value="conf.formData.salaryRange.advancedValue.M"
            unit="元/月"
            :show="true"
            :step="200"
            :ui="{ base: 'max-w-20' }"
          /></div
      ></template>
    </UPopover>
  </FormItem>
</template>
