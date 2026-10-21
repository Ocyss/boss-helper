<script setup lang="ts">
import { computed, ref } from 'vue'

import AI from '../components/AI.vue'

const editor = ref<InstanceType<typeof AI>>()
const isDirty = computed(() => Boolean(editor.value?.isDirty))
async function save(options?: { silent?: boolean }) {
  return (await editor.value?.save(options)) ?? true
}
defineExpose({ save, isDirty })
</script>

<template>
  <UCard
    data-help="先配置提供商与模型，再选择招呼语或岗位筛选，修改提示词并保存。回复功能暂未开放。"
  >
    <AI ref="editor" />
  </UCard>
</template>
