<script lang="ts" setup>
const emits = defineEmits<{
  close: [value: boolean]
}>()
</script>

<template>
  <UModal title="日志查看">
    <template #body> <span>Log</span></template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="emits('close', false)"> Cancel </UButton>
        <UButton @click="emits('close', true)"> Confirm </UButton>
      </div>
    </template>
  </UModal>
</template>
