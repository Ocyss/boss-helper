<script lang="ts" setup>
import { formInfoData, useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'
import { counter } from '@/message'

const conf = useConf()
const helper = useHelper()
const config = conf.formData.resumeImage
const selectedFile = ref<File | undefined>()
const loading = ref(false)
const restoring = ref(false)
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** 从本机 IndexedDB 恢复已配置图片，仅用于设置页预览和重新选择。 */
async function restoreImage() {
  if (!config.image) {
    selectedFile.value = undefined
    return
  }
  restoring.value = true
  try {
    const response = await counter.getImage(config.image)
    if (!response.success) {
      config.image = ''
      config.name = ''
      config.type = ''
      selectedFile.value = undefined
      return
    }
    const bytes = new Uint8Array(response.buffer)
    selectedFile.value = new File([bytes.buffer], response.name, { type: response.type })
  } finally {
    restoring.value = false
  }
}

/** 将用户选中的图片写入 background IndexedDB，配置只保存稳定引用。 */
async function handleFileUpdate(value: File | File[] | undefined | null) {
  const file = Array.isArray(value) ? value[0] : value
  if (!file) {
    return
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    useToast().add({ title: '仅支持 PNG、JPEG 或 WebP 图片', color: 'error' })
    selectedFile.value = undefined
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    useToast().add({ title: '图片不能超过 2 MiB', color: 'error' })
    selectedFile.value = undefined
    return
  }
  loading.value = true
  try {
    const stored = await counter.setImage({
      name: file.name,
      type: file.type,
      buffer: Array.from(new Uint8Array(await file.arrayBuffer())),
    })
    config.image = stored.key
    config.name = file.name
    config.type = file.type
    selectedFile.value = file
    useToast().add({ title: '图片简历已保存到本机扩展存储', color: 'success' })
  } finally {
    loading.value = false
  }
}

/** 清除图片引用并删除本机 IndexedDB 副本。 */
async function clearImage() {
  const key = config.image
  if (key) await counter.removeImage(key)
  config.image = ''
  config.name = ''
  config.type = ''
  config.enable = false
  selectedFile.value = undefined
}

onMounted(() => {
  void restoreImage()
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <UAlert
      color="warning"
      variant="subtle"
      title="图片简历自动发送"
      description="默认关闭。只有自动投递和本开关同时开启，招呼语成功后才会发送图片；图片仅保存在本机扩展 IndexedDB，不进入 AI、日志或配置导出。"
    />
    <UCheckbox
      v-bind="formInfoData.resumeImage"
      v-model="config.enable"
      :disabled="helper.workflowRunning.value || !config.image"
    />
    <UFileUpload
      v-model="selectedFile"
      accept="image/png,image/jpeg,image/webp"
      :disabled="helper.workflowRunning.value || loading || restoring"
      :loading="loading || restoring"
      label="上传图片简历（PNG/JPEG/WebP，最大 2 MiB）"
      description="上传后点击页面的保存配置；发送仍受自动投递开关保护。"
      @update:model-value="handleFileUpdate"
    />
    <div v-if="config.image" class="flex items-center justify-between gap-2 text-sm text-muted">
      <span>当前文件：{{ config.name || '已上传图片' }}</span>
      <UButton color="error" variant="outline" size="sm" @click="clearImage">清除</UButton>
    </div>
    <p v-else class="text-sm text-muted">尚未上传图片，开关不可用。</p>
  </div>
</template>
