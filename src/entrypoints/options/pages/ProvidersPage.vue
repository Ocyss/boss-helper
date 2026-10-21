<script setup lang="ts">
import LLMModelManage from '../components/AI/LLMModelManage.vue'
</script>

<template>
  <UCard
    data-help="添加 AI 提供商，填写 API 地址、密钥及模型名称。密钥仅在插件配置页编辑，请勿分享含密钥的导出文件。"
  >
    <template #header><h2 class="font-semibold">AI 提供商与模型</h2></template>
    <LLMModelManage embedded />
  </UCard>
</template>
