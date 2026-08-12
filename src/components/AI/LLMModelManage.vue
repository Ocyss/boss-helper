<script lang="ts" setup>
import { ref } from 'vue'

import Alert from '@/components/Alert.vue'
import { useConf } from '@/composables/conf'
import type { ModelConf } from '@/composables/useModel'
import { useModel } from '@/composables/useModel'
import { counter } from '@/message'
import type { FormData } from '@/types/formData'
import { normalizeCandidateProfile } from '@/utils/candidateProfile'
import deepmerge, { jsonClone } from '@/utils/deepmerge'

import CreateLLM from './LLMModelEdit.vue'

const modelStore = useModel()
const conf = useConf()
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

interface AiConfigurationBundle {
  version: 1
  models: ModelConf[]
  aiReply: FormData['aiReply']
  candidateProfile: FormData['candidateProfile']
}

async function exportllm(): Promise<void> {
  await counter.exportAiConfiguration(
    {
      version: 1,
      models: jsonClone(modelStore.modelData.value),
      aiReply: jsonClone(conf.formData.aiReply),
      candidateProfile: jsonClone(conf.formData.candidateProfile),
    } satisfies AiConfigurationBundle,
    'AI配置',
  )
}

async function importllm(): Promise<void> {
  try {
    const data = await counter.importAiConfiguration<ModelConf[] | Partial<AiConfigurationBundle>>()
    if (Array.isArray(data)) {
      modelStore.modelData.value = data
    } else {
      if (!Array.isArray(data.models)) throw new Error('AI 配置文件缺少 models 数组')
      modelStore.modelData.value = data.models

      if (data.aiReply) {
        const importedAiReply = jsonClone(data.aiReply)
        delete importedAiReply.feishuConfig
        deepmerge(conf.formData.aiReply, importedAiReply, { clone: false })
      }
      if (data.candidateProfile) {
        conf.formData.candidateProfile = normalizeCandidateProfile(data.candidateProfile)
      }
    }
    toast.add({
      title: 'AI 配置导入成功，请点击保存',
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: `AI 配置导入失败：${error instanceof Error ? error.message : String(error)}`,
      color: 'error',
    })
  }
}

async function saveAll(): Promise<void> {
  await modelStore.saveModel()
  await conf.confSaving()
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
      <Alert
        color="warning"
        class="mb-4"
        title="导出文件包含敏感信息"
        description="AI 配置导出文件包含模型密钥；如已配置飞书，还会包含 App Secret 与账号绑定信息，请勿分享。"
      />
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
        <UButton color="success" @click="exportllm"> 导出（含密钥） </UButton>
        <UButton color="success" @click="importllm"> 导入 </UButton>
        <UButton @click="newllm"> 新建 </UButton>
        <UButton @click="saveAll"> 保存 </UButton>
      </div>
    </template>
  </UModal>
</template>
