<script lang="ts" setup>
import type { llms } from '@/composables/useModel'
import LLMFormItem from './LLMFormItem.vue'

const props = defineProps<{
  data: (typeof llms)[number]
}>()
const formData = defineModel<Record<string, unknown>>({ required: true })
</script>

<template>
  <template v-for="(item, key) in props.data" :key="key">
    <div v-if="'mode' in item" style="margin: 5px 0 20px 0">
      <h3 style="font-size: 16px;  margin-bottom: 10px; user-select: text;" v-html="item.desc" />
    </div>
    <LLMFormItem v-else v-model="formData[key]" :label="key" :value="item as any" />
  </template>
</template>

<style lang="scss" scoped></style>
