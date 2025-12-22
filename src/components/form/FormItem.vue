<script lang="ts" setup>
import { ElCheckbox, ElFormItem, ElLink } from 'element-plus'

defineProps<{
  label: string
  help?: string
  disabled?: boolean
}>()

const include = defineModel<boolean | undefined>('include', {
  default: undefined,
})
const enable = defineModel<boolean>('enable', { required: true })
</script>

<template>
  <ElFormItem :data-help="help">
    <template #label>
      <ElCheckbox v-model="enable" :label size="small" />
      <slot name="include">
        <ElLink
          v-if="include != null"
          :type="include ? 'primary' : 'warning'"
          size="small"
          :disabled
          @click.stop="include = !include"
        >
          {{ include ? "包含" : "排除" }}
        </ElLink>
      </slot>
    </template>
    <slot />
  </ElFormItem>
</template>

<style lang="scss" scoped></style>
