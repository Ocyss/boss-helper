<script lang="ts" setup>
import { ElButton, ElDialog } from 'element-plus'

const show = defineModel<boolean>({ required: true })
</script>

<template>
  <ElDialog
    v-model="show"
    title="存储配置"
    width="500"
    align-center
    destroy-on-close
    :z-index="20"
  >
    <span>
      当使用多账户时候,该配置内含有敏感信息,导入导出一定要注意,避免泄露
    </span>
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
