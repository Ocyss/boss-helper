<script lang="ts" setup>
import { formInfoData, useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper/index.js'
import { type ConfigItem } from '@/composables/useHelper/type'

import Address from './Address.vue'
import Appearance from './Appearance.vue'
import BatchPause from './BatchPause.vue'
import CustomGreeting from './CustomGreeting.vue'
import SalaryRangeComponent from './Form/SalaryRange.vue'
import GreetingFallback from './GreetingFallback.vue'
import ResumeImage from './ResumeImage.vue'
import SalaryRange from './SalaryRange.vue'

const props = defineProps<{
  item: ConfigItem
}>()

const helper = useHelper()
const conf = useConf()
</script>

<template>
  <Alert v-if="item.type === 'alert'" v-bind="item" />
  <CustomGreeting v-else-if="item.type === 'customGreeting'" />
  <ResumeImage v-else-if="item.type === 'resumeImage'" />
  <GreetingFallback v-else-if="item.type === 'greetingFallback'" />
  <BatchPause v-else-if="item.type === 'batchPause'" />
  <Address v-else-if="item.type === 'address'" />
  <Appearance v-else-if="item.type === 'appearance'" />
  <FormItem
    v-else-if="item.type === 'companySizeRange'"
    label="公司规模范围"
    data-help="投递工作的公司规模, 推荐使用boss自带选项进行筛选。严格宽松定义在薪资高级配置中有写"
    v-model:enable="conf.formData.companySizeRange.enable"
    class="col-span-2 xl:col-span-1"
  >
    <SalaryRangeComponent
      :controls="false"
      :value="conf.formData.companySizeRange.value"
      unit="人"
      :show="true"
    />
  </FormItem>
  <SalaryRange v-else-if="item.type === 'salaryRange'" />

  <UFormField v-else-if="item.type === 'inputNumber'" v-bind="item.fieldProps">
    <UInputNumber v-model="conf.formData[item.key]" v-bind="item.inputNumberProps" />
  </UFormField>

  <FormItem
    v-else-if="item.type === 'select'"
    v-bind="formInfoData[item.key]"
    v-model:enable="conf.formData[item.key].enable"
    v-model:include="conf.formData[item.key].include"
    :disabled="helper.workflowRunning.value"
  >
    <formSelect
      v-model:value="conf.formData[item.key].value"
      v-model:options="conf.formData[item.key].options"
    />
  </FormItem>
  <span
    v-else-if="item.type === 'checkbox'"
    v-bind="formInfoData[item.key]"
    :title="formInfoData[item.key]['data-help']"
  >
    <UCheckbox v-model="conf.formData[item.key].value" :label="formInfoData[item.key]['label']" />
  </span>

  <div v-else-if="item.type === 'div'" v-bind="item">
    <template v-for="(value, index) in item.items" :key="index">
      <ConfigItem v-if="value" :item="value" />
    </template>
  </div>
</template>
