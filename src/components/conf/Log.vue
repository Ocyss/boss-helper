<script lang="ts" setup>
import { ElButton, ElDialog } from 'element-plus'

const show = defineModel<boolean>({ required: true })
</script>

<template>
  <ElDialog
    v-model="show"
    title="日志查看"
    width="500"
    align-center
    destroy-on-close
    :z-index="20"
  >
    <span>Log</span>
    <template #footer>
      <div>
        <ElButton @click="show = false">
          Cancel
        </ElButton>
        <ElButton type="primary" @click="show = false">
          Confirm
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style lang="scss" scoped></style>
