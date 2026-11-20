<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import { counter } from '@/message'
import type { FeishuConfig } from '@/utils/feishuBackground'

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const creating = ref(false)
const config = reactive<FeishuConfig>({
  enabled: false,
  appId: '',
  appSecret: '',
  appToken: '',
  tableIdBoss: '',
})
onMounted(async () => {
  try {
    Object.assign(config, await counter.storageGet('local:feishu-config', { ...config }))
  } catch (error) {
    toast.add({ title: '飞书配置加载失败', description: String(error), color: 'error' })
  } finally {
    loading.value = false
  }
})
async function save() {
  saving.value = true
  try {
    await counter.storageSet('local:feishu-config', { ...config })
    toast.add({ title: '飞书配置已保存', color: 'success' })
  } catch (error) {
    toast.add({ title: '保存失败', description: String(error), color: 'error' })
  } finally {
    saving.value = false
  }
}
async function createTable() {
  if (
    config.tableIdBoss &&
    !window.confirm('将创建新的模板表并替换当前 Table ID，原表不会删除。是否继续？')
  )
    return
  creating.value = true
  try {
    await counter.storageSet('local:feishu-config', { ...config })
    const result = await counter.createTableBoss()
    config.tableIdBoss = result.tableIdBoss
    toast.add({ title: '模板表已创建，Table ID 已自动保存', color: 'success' })
  } catch (error) {
    toast.add({ title: '创建飞书模板失败', description: String(error), color: 'error' })
  } finally {
    creating.value = false
  }
}
function gotoCreateApp() {
  window.open('https://open.feishu.cn/app?lang=zh-CN', '_blank')
}
function gotoAppTokenDoc() {
  window.open(
    'https://open.feishu.cn/document/server-docs/docs/bitable-v1/bitable-overview#-752212c:~:text=cn/sheets%20%E5%BC%80%E5%A4%B4-,%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%20app_token%20%E8%8E%B7%E5%8F%96%E6%96%B9%E5%BC%8F,-%E4%B8%8D%E5%90%8C%E5%BD%A2%E6%80%81%E7%9A%84',
    '_blank',
  )
}
function openBatchPermission() {
  prompt(
    '权限管理批量开通如下权限',
    `{
    "scopes": {
      "tenant": [
        "base:record:create",
        "base:record:retrieve",
        "base:record:update",
        "base:table:create"
      ]
    }
  }`,
  )
}
</script>

<template>
  <div class="space-y-5">
    <UCard>
      <template #header><h2 class="font-semibold">飞书多维表格</h2></template>
      <UForm :state="config" :disabled="loading || saving || creating" class="space-y-4">
        <USwitch v-model="config.enabled" label="启用飞书同步" />
        <Alert
          color="warning"
          title="必须使用自动创建的模板"
          description="请填写已有多维表格的 App Token，并点击自动创建。其他 Table ID 因字段结构不一致会报错，请勿修改模板字段名称和类型。"
          :actions="[
            {
              label: '创建应用',
              color: 'primary',
              variant: 'subtle',
              onClick: gotoCreateApp,
            },
            {
              label: 'AppToken获取文档',
              color: 'primary',
              variant: 'subtle',
              onClick: gotoAppTokenDoc,
            },
            {
              label: '复制批量开通权限',
              color: 'primary',
              variant: 'subtle',
              onClick: openBatchPermission,
            },
          ]"
        />
        <UFormField label="App ID"
          ><UInput v-model.trim="config.appId" class="w-full"
        /></UFormField>
        <UFormField label="App Secret"
          ><UInput
            v-model.trim="config.appSecret"
            type="password"
            autocomplete="off"
            class="w-full"
        /></UFormField>
        <UFormField label="App Token"
          ><UInput v-model.trim="config.appToken" class="w-full"
        /></UFormField>
        <UFormField label="Table ID - Boss直聘">
          <UFieldGroup>
            <UButton
              :loading="creating"
              :disabled="!config.enabled || !config.appId || !config.appSecret || !config.appToken"
              @click="createTable"
              >自动创建</UButton
            >
            <UInput v-model.trim="config.tableIdBoss" class="flex-1" />
          </UFieldGroup>
        </UFormField>
        <p class="text-sm text-muted text-wrap">
          访问 Token
          由扩展后台自动获取及刷新，无需填写。应用需开通多维表格读写权限，并拥有目标文档的编辑权限(右上角更多-添加文档应用)。启用后每处理
          5 个岗位、暂停或停止时同步岗位及 AI 处理结果。密钥仅保存在本地扩展存储中，请勿分享。
        </p>
        <UButton :loading="saving" @click="save">保存飞书配置</UButton>
      </UForm>
    </UCard>
  </div>
</template>
