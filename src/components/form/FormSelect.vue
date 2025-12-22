<script lang="ts" setup>
import { ElOption, ElSelect } from 'element-plus'

const value = defineModel<string[]>('value', { required: true })
const options = defineModel<string[]>('options', { required: true })
</script>

<template>
  <ElSelect
    v-model="value"
    multiple
    filterable
    allow-create
    default-first-option
    :reserve-keyword="false"
    placeholder=""
  >
    <ElOption
      v-for="item in options"
      :key="item"
      :label="item"
      :value="item"
    />
  </ElSelect>
</template>

<style lang="scss" scoped></style>
