<script lang="ts" setup>
import { ref } from 'vue'

import type { ModelConf } from '@/composables/useModel'
import { useModel, migrateModelConfig } from '@/composables/useModel'
import { jsonClone } from '@/utils/deepmerge'
import { exportJson, importJson } from '@/utils/jsonImportExport'

import CreateLLM from './LLMModelEdit.vue'

const modelStore = useModel()
const createBoxShow = ref(false)
const toast = useToast()

function del(d: ModelConf) {
  modelStore.modelData.value = modelStore.modelData.value.filter((v) => d.key !== v.key)
}

function copy(d: ModelConf) {
  d = jsonClone(d)
  d.key = new Date().getTime().toString()
  d.name = `${d.name} 副本`
  modelStore.modelData.value.push(d)
}

const createModelData = ref()

function edit(d: ModelConf) {
  createModelData.value = d
  createBoxShow.value = true
}

function newllm() {
  createModelData.value = undefined
  createBoxShow.value = true
}

function create(d: ModelConf) {
  if (d.key) {
    const old = modelStore.modelData.value.find((v) => v.key === d.key)
    if (old) {
      Object.assign(old, d)
    } else {
      d.key = new Date().getTime().toString()
      modelStore.modelData.value.push(d)
    }
  } else {
    d.key = new Date().getTime().toString()
    modelStore.modelData.value.push(d)
  }
  createBoxShow.value = false
}

function exportllm() {
  exportJson(jsonClone(modelStore.modelData.value), 'Ai模型配置')
}

function importllm() {
  importJson<ModelConf[]>().then((data) => {
    modelStore.modelData.value = data.map(migrateModelConfig)
    toast.add({
      title: '导入成功, 请手动保存',
      color: 'success',
    })
  })
}
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4">
    <div class="flex min-w-0 flex-col gap-4">
      <UAlert
        title="先连接提供商，再配置 AI 功能"
        description="新建模型 → 填写 API 地址、API Key 和模型 ID → 测试连接 → 应用到列表 → 点击页面底部「保存配置与模型」。然后在招呼语或筛选中选择模型。支持 OpenAI Compatible、OpenAI Responses 与 Anthropic Messages 协议。"
        color="info"
        variant="soft"
      />
      <p class="text-sm text-muted">
        列表修改、复制、删除和导入不会自动保存，请点击页面底部「保存配置与模型」。API Key
        属于敏感信息，导出文件也包含密钥，请勿分享。
      </p>
      <UTable
        :data="modelStore.modelData.value"
        :columns="[
          { id: 'name', header: '配置名称' },
          { id: 'model', header: '模型 ID' },
          { id: 'desc', header: '地址' },
          { id: 'manage', header: '管理' },
        ]"
        style="width: 100%"
      >
        <template #name-cell="{ row }">
          <span>{{ row.original.name }}</span>
        </template>
        <template #model-cell="{ row }">
          <span>{{ row.original.data?.model }}</span>
        </template>
        <template #desc-cell="{ row }">
          <p class="line-clamp-1">
            {{ row.original.data && row.original.data.base_url }}
          </p>
        </template>
        <template #manage-cell="{ row }">
          <div style="width: 200px">
            <UButton variant="link" color="error" size="sm" @click="del(row.original)">
              删除
            </UButton>
            <UButton variant="link" color="primary" size="sm" @click="copy(row.original)">
              复制
            </UButton>
            <UButton variant="link" color="primary" size="sm" @click="edit(row.original)">
              编辑
            </UButton>
          </div>
        </template>
        <template #empty>尚无模型，请点击「新建模型」连接你的提供商。</template>
      </UTable>
      <CreateLLM
        v-if="createBoxShow"
        v-model="createBoxShow"
        :model="createModelData"
        @create="create"
      />
    </div>

    <div class="flex flex-wrap justify-end gap-2 border-t border-default pt-4">
      <UButton color="success" @click="exportllm"> 导出 </UButton>
      <UButton color="success" @click="importllm"> 导入 </UButton>
      <UButton @click="newllm"> 新建模型 </UButton>
    </div>
  </section>
</template>
