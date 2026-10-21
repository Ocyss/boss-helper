<script setup lang="ts">
defineProps<{
  embedded?: boolean
  title: string
  ui?: Record<string, string>
}>()
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <section v-if="embedded" class="flex min-w-0 flex-col gap-4">
    <div class="flex min-w-0 flex-col gap-4"><slot name="body" /></div>
    <div class="flex flex-wrap justify-end gap-2 border-t border-default pt-4">
      <slot name="footer" />
    </div>
  </section>
  <UModal v-else v-model:open="open" :title="title" :ui="ui" :dismissible="false">
    <slot />
    <template #body><slot name="body" /></template>
    <template #footer><slot name="footer" /></template>
  </UModal>
</template>
