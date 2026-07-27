<script lang="ts" setup>
const emits = defineEmits<{
  close: [value: boolean]
}>()
</script>

<template>
  <UModal title="存储配置">
    <template #body>
      <span> 当使用多账户时候,该配置内含有敏感信息,导入导出一定要注意,避免泄露 </span></template
    >

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="emits('close', false)"> Cancel </UButton>
        <UButton @click="emits('close', true)"> Confirm </UButton>
      </div>
    </template>
  </UModal>
</template>
