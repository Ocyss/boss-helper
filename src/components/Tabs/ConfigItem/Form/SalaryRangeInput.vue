<script lang="ts" setup>
import { type InputNumberProps } from '@nuxt/ui'

const props = withDefaults(
  defineProps<{
    value: [number, number, boolean]
    unit: string
    show: boolean
    step?: number
    controls?: boolean
    ui?: InputNumberProps['ui']
  }>(),
  {
    controls: true,
    ui: {
      // @ts-ignore
      base: 'max-w-25',
    },
  },
)

const handleToggle = () => {
  props.value[2] = !props.value[2]
}
</script>

<template>
  <UFieldGroup>
    <UInputNumber
      v-model="props.value[0]"
      :min="0"
      :step="props.step"
      :increment="false"
      :decrement="false"
      :ui="props.ui"
    />
    <UBadge>-</UBadge>
    <UInputNumber
      v-model="props.value[1]"
      :min="0"
      :step="props.step"
      :increment="false"
      :decrement="false"
      :ui="props.ui"
    />

    <UBadge>{{ props.unit }}</UBadge>
    <UButton v-if="props.show" @click="handleToggle">
      {{ props.value[2] ? '严格' : '宽松' }}
    </UButton>
    <slot />
  </UFieldGroup>
</template>
