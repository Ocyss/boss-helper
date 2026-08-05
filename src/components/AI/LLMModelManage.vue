<script lang="ts" setup>
import { ref } from 'vue'

import Alert from '@/components/Alert.vue'
import type { ModelConf } from '@/composables/useModel'
import { useModel } from '@/composables/useModel'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { exportJson, importJson } from '@/utils/jsonImportExport'

import CreateLLM from './LLMModelEdit.vue'

const modelStore = useModel()
const createBoxShow = ref(false)
const toast = useToast()
const open = ref(false)

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
      deepmerge(old, d, { clone: false })
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
function close() {
  modelStore.initModel()
  open.value = false
}

/** 递归移除模型导出中的密钥、Cookie 和授权头字段。 */
function sanitizeModelExport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeModelExport(item))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/api[_-]?key|authorization|token|secret|password|cookie/iu.test(key))
      .map(([key, item]) => [key, sanitizeModelExport(item)]),
  )
}

function exportllm() {
  // 导出只保留可分享的模型元数据；API 密钥永远不进入下载文件。
  const safeModels = sanitizeModelExport(jsonClone(modelStore.modelData.value)) as ModelConf[]
  exportJson(safeModels, 'Ai模型配置-不含密钥')
}

function importllm() {
  importJson<ModelConf[]>().then((data) => {
    modelStore.modelData.value = data
    toast.add({
      title: '导入成功, 请手动保存',
      color: 'success',
    })
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Ai模型配置"
    :ui="{ content: 'sm:max-w-[70%]' }"
    ref="manageModelRef"
    :dismissible="false"
  >
    <slot />
    <template #body>
      <UTable
        :data="modelStore.modelData.value"
        :columns="[
          { id: 'model', header: '模型' },
          { id: 'desc', header: '描述' },
          { id: 'manage', header: '管理' },
        ]"
        style="width: 100%"
      >
        <template #model-cell="{ row }">
          <div style="align-items: center; display: flex">
            <UAvatar :src="row.original.data?.avatar" :alt="row.original.name" />
            <span style="margin-left: 8px">{{ row.original.name }}</span>
          </div>
        </template>
        <template #desc-cell="{ row }">
          <p class="line-clamp-1">
            {{ row.original.data && row.original.data.base_url }}
          </p>
        </template>
        <template #manage-cell="{ row }">
          <div style="width: 200px">
            <UButton variant="link" color="primary" size="sm" @click="del(row.original)">
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
      </UTable>
      <CreateLLM
        v-if="createBoxShow"
        v-model="createBoxShow"
        :model="createModelData"
        @create="create"
      />
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="close"> 取消 </UButton>
        <UButton color="success" @click="exportllm"> 导出 </UButton>
        <UButton color="success" @click="importllm"> 导入 </UButton>
        <UButton @click="newllm"> 新建 </UButton>
        <UButton @click="modelStore.saveModel"> 保存 </UButton>
      </div>
    </template>
  </UModal>
</template>
