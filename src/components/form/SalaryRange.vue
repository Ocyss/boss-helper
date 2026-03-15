<script lang="ts" setup>
import { ElInputNumber, ElButton } from 'element-plus'

const props = withDefaults(
  defineProps<{
    value: [number, number, boolean]

    unit: string

    show: boolean

    step?: number

    width?: string

    controls?: boolean
  }>(),
  {
    controls: true,
  },
)

const handleToggle = () => {
  props.value[2] = !props.value[2]
}
</script>

<template>
  <div style="display: flex; flex: 1; justify-content: space-between; align-items: center">
    <ElInputNumber
      v-model="props.value[0]"
      :style="`width: ${props.width || '105px'};`"
      :controls="props.controls"
      controls-position="right"
      :min="0"
      :step="props.step"
    />
    <span>-</span>
    <ElInputNumber
      v-model="props.value[1]"
      :style="`width: ${props.width || '105px'};`"
      :controls="props.controls"
      controls-position="right"
      :min="0"
      :step="props.step"
    />
    <span>{{ props.unit }}</span>

    <ElButton v-if="props.show" @Click="handleToggle" size="small">
      {{ props.value[2] ? '严格' : '宽松' }}
    </ElButton>
  </div>
</template>

<style lang="scss" scoped></style>
