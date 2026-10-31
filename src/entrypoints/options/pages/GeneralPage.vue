<script setup lang="ts">
import { computed } from 'vue'

import Alert from '@/components/Alert.vue'
import { useConf } from '@/composables/conf'
import { useConfigSections } from '@/composables/conf/sections'

import ConfigItem from '../components/ConfigItem/ConfigItem.vue'
defineProps<{ busy: boolean }>()
const conf = useConf()
const schema = useConfigSections()
const sections = computed(() => schema.value[1].filter((item) => item !== false))

const configLevelHelp = '为不同人群展示不同的配置项, 减少上手难度跟配置过多而产生的恐惧'
const configLevelOptions = [
  { value: 'beginner', label: '新手' },
  { value: 'intermediate', label: '初学者' },
  { value: 'advanced', label: '中级' },
  { value: 'expert', label: '高级' },
]
</script>

<template>
  <div class="space-y-5">
    <Alert v-for="alert in schema[0]" :key="alert.id" v-bind="alert" />
    <UForm :disabled="busy" class="space-y-6">
      <UCard id="section-basic" class="scroll-mt-6">
        <template #header><h2 class="font-semibold">基础设置</h2></template>
        <div class="flex flex-wrap items-center gap-5">
          <UFormField label="配置级别" :data-help="configLevelHelp">
            <USelectMenu
              v-model="conf.formData.configLevel"
              :items="configLevelOptions"
              value-key="value"
              :search-input="false"
            />
          </UFormField>
          <span data-help="停止投递时发送桌面通知，需要允许浏览器通知权限。">
            <UCheckbox v-model="conf.formData.notification.value" label="发送通知" />
          </span>

          <UFormField
            v-if="conf.configLevel.intermediate"
            label="投递数量"
            data-help="达到设定的投递数量后自动暂停。请结合平台限制设置。"
          >
            <UInputNumber
              v-model="conf.formData.deliveryLimit.value"
              :min="1"
              :max="155"
              :step="10"
            />
          </UFormField>
        </div>
      </UCard>
      <UCard
        v-for="section in sections"
        :id="`section-${section.value}`"
        :key="section.value"
        class="scroll-mt-6"
      >
        <template #header
          ><h2 class="font-semibold">
            {{ section.label }}
          </h2></template
        >
        <div class="space-y-4">
          <template v-for="(item, index) in section.items" :key="index"
            ><ConfigItem v-if="item" :item="item"
          /></template>
        </div>
      </UCard>
    </UForm>
  </div>
</template>
