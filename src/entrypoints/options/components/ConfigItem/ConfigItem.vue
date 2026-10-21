<script lang="ts" setup>
import type { DropdownMenuItem } from '@nuxt/ui'

import Appearance from '@/components/Tabs/ConfigItem/Appearance.vue'
import { formInfoData, useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper/index.js'
import type { ConfigItem } from '@/composables/useHelper/type'

import Address from './Address.vue'
import CustomGreeting from './CustomGreeting.vue'
import FormRange from './Form/FormRange.vue'
import SalaryRange from './SalaryRange.vue'

const props = defineProps<{
  item: ConfigItem
}>()

const helper = useHelper()
const conf = useConf()

const exp = computed(() => {
  if (
    !props.item ||
    props.item.type !== 'checkbox-expire' ||
    !('key' in props.item) ||
    !conf.formData[props.item.key]
  ) {
    return []
  }
  return [
    { label: '不限', value: 0 },
    { label: '7天', value: 7 * 24 * 60 * 60 * 1000 },
    { label: '30天', value: 30 * 24 * 60 * 60 * 1000 },
    { label: '90天', value: 90 * 24 * 60 * 60 * 1000 },
    { label: '180天', value: 180 * 24 * 60 * 60 * 1000 },
    { label: '360天', value: 360 * 24 * 60 * 60 * 1000 },
  ].map(
    (menu) =>
      ({
        ...menu,
        value: menu.value,
        type: 'checkbox',
        checked: conf.formData[(props.item as { key: string }).key].expire === menu.value,
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            conf.formData[(props.item as { key: string }).key].expire = menu.value
          }
        },
      }) satisfies DropdownMenuItem,
  )
})
</script>

<template>
  <Alert v-if="item.type === 'alert'" v-bind="item" />
  <CustomGreeting v-else-if="item.type === 'customGreeting'" />
  <Address v-else-if="item.type === 'address'" />
  <Appearance v-else-if="item.type === 'appearance'" />
  <FormItem
    v-else-if="item.type === 'companySizeRange'"
    label="公司规模范围"
    data-help="投递工作的公司规模, 推荐使用boss自带选项进行筛选。严格宽松定义在薪资高级配置中有写"
    v-model:enable="conf.formData.companySizeRange.enable"
    class="col-span-2 xl:col-span-1"
  >
    <FormRange
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
  <span
    v-else-if="item.type === 'checkbox-expire'"
    v-bind="formInfoData[item.key]"
    :title="formInfoData[item.key]['data-help']"
    class="flex flex-row gap-0.5 justify-center items-center"
  >
    <UCheckbox v-model="conf.formData[item.key].value" :label="formInfoData[item.key]['label']" />
    <UDropdownMenu v-model="conf.formData[item.key].expire" :items="exp" value-key="value">
      <UButton
        icon="i-lucide-clock-fading"
        color="neutral"
        variant="outline"
        title="过期时间"
        size="xs"
      />
    </UDropdownMenu>
  </span>

  <div v-else-if="item.type === 'div'" v-bind="item">
    <template v-for="(value, index) in item.items" :key="index">
      <ConfigItem v-if="value" :item="value" />
    </template>
  </div>
</template>
