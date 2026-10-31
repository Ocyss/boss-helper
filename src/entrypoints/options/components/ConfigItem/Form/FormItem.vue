<script lang="ts" setup>
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  label?: string
  help?: string
  disabled?: boolean
}>()

const attrs = useAttrs()
const helpText = computed(() => props.help ?? (attrs['data-help'] as string | undefined))

const include = defineModel<boolean | undefined>('include', {
  default: undefined,
})
const enable = defineModel<boolean>('enable', { required: true })
</script>

<template>
  <UFormField v-bind="$attrs" :data-help="helpText" :title="helpText">
    <template #label>
      <UFieldGroup class="flex flex-row gap-1 items-center">
        <UCheckbox v-model="enable" :label size="sm" />
        <UButton
          class="pl-px"
          v-if="include != null"
          :color="include ? 'primary' : 'warning'"
          variant="link"
          size="sm"
          :disabled
          @click.stop="
            () => {
              include = !include
            }
          "
        >
          {{ include ? '包含' : '排除' }}
        </UButton>
      </UFieldGroup>
    </template>
    <slot />
  </UFormField>
</template>
