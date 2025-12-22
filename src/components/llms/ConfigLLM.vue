<script lang="ts" setup>
import type { modelData } from '@/composables/useModel'
import { ElAvatar, ElButton, ElDialog, ElIcon, ElMessage, ElTable, ElTableColumn, ElText,
} from 'element-plus'
import { ref } from 'vue'
import Alert from '@/components/Alert'
import { llmIcon, useModel } from '@/composables/useModel'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { exportJson, importJson } from '@/utils/jsonImportExport'

import CreateLLM from './CreateLLM.vue'

const show = defineModel<boolean>({ required: true })
const modelStore = useModel()

const createBoxShow = ref(false)

function del(d: modelData) {
  modelStore.modelData = modelStore.modelData.filter(v => d.key !== v.key)
  ElMessage.success('删除成功')
}

function copy(d: modelData) {
  d = jsonClone(d)
  d.key = new Date().getTime().toString()
  d.name = `${d.name} 副本`
  modelStore.modelData.push(d)
  ElMessage.success('复制成功')
}

const createModelData = ref()

function edit(d: modelData) {
  createModelData.value = d
  createBoxShow.value = true
}

function newllm() {
  createModelData.value = undefined
  createBoxShow.value = true
}

function create(d: modelData) {
  if (d.key) {
    const old = modelStore.modelData.find(v => v.key === d.key)
    if (old) {
      deepmerge(old, d, { clone: false })
    }
    else {
      d.key = new Date().getTime().toString()
      modelStore.modelData.push(d)
    }
  }
  else {
    d.key = new Date().getTime().toString()
    modelStore.modelData.push(d)
  }
  createBoxShow.value = false
}

function close() {
  modelStore.initModel()
  show.value = false
}

function exportllm() {
  exportJson(jsonClone(modelStore.modelData), 'Ai模型配置')
}

function importllm() {
  importJson<modelData[]>().then((data) => {
    modelStore.modelData = data
    ElMessage.success('导入成功, 请手动保存')
  })
}
</script>

<template>
  <ElDialog
    v-model="show"
    title="Ai模型配置"
    width="70%"
    align-center
    destroy-on-close
    :z-index="20"
  >
    <Alert id="llm-config-alert" title="注意" type="warning">
      会员模型暂时不支持输出 思考过程, 比如deepseekR1，但是不影响模型能力
    </Alert>
    <ElTable :data="modelStore.modelData" style="width: 100%" table-layout="auto">
      <ElTableColumn label="模型">
        <template #default="scope">
          <div style="align-items: center; display: flex">
            <ElAvatar
              :size="30"
              :style="{ '--el-avatar-bg-color': scope.row.color }"
            >
              <ElIcon v-html="scope.row.vip != null ? llmIcon.vip : llmIcon[scope.row.data.mode]" />
            </ElAvatar>
            <span style="margin-left: 8px">{{ scope.row.name }}</span>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="描述">
        <template #default="scope">
          <ElText line-clamp="1">
            {{ scope.row.vip == null ? scope.row.data.url : scope.row.vip.description }}
          </ElText>
        </template>
      </ElTableColumn>
      <ElTableColumn label="管理">
        <template #default="scope">
          <div v-if="scope.row.vip == null" style="width: 200px;">
            <ElButton
              link
              type="primary"
              size="small"
              @click="() => del(scope.row)"
            >
              删除
            </ElButton>
            <ElButton
              link
              type="primary"
              size="small"
              @click="() => copy(scope.row)"
            >
              复制
            </ElButton>
            <ElButton
              link
              type="primary"
              size="small"
              @click="() => edit(scope.row)"
            >
              编辑
            </ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
    <CreateLLM
      v-if="createBoxShow"
      v-model="createBoxShow"
      :model="createModelData"
      @create="create"
    />

    <template #footer>
      <div>
        <ElButton @click="close">
          取消
        </ElButton>
        <ElButton type="success" @click="exportllm">
          导出
        </ElButton>
        <ElButton type="success" @click="importllm">
          导入
        </ElButton>
        <ElButton type="primary" @click="newllm">
          新建
        </ElButton>
        <ElButton type="primary" @click="modelStore.saveModel">
          保存
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style lang="scss" scoped></style>
