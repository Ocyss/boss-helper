<script setup lang="ts">
import { ref } from 'vue'

import { counter } from '@/message'

const before = defineModel<string[]>('before', { required: true })
const after = defineModel<string[]>('after', { required: true })
const open = ref(false)
const loading = ref(false)
const toast = useToast()
const groups = ref<{ label: string; files: File[] }[]>([])

async function enter() {
  loading.value = true
  groups.value = []
  open.value = true
  try {
    for (const [label, keys] of [
      ['前置图片', before.value],
      ['后置图片', after.value],
    ] as const) {
      const files: File[] = []
      for (const key of keys) {
        const image = await counter.getImage(key)
        if (!image.success) throw new Error('图片未上传或已过期，请重新配置')
        files.push(new File([new Uint8Array(image.buffer)], image.name, { type: image.type }))
      }
      groups.value.push({ label, files })
    }
  } catch (error) {
    toast.add({ title: String(error), color: 'error' })
    open.value = false
  } finally {
    loading.value = false
  }
}

function move(files: File[], index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= files.length) return
  const [file] = files.splice(index, 1)
  files.splice(target, 0, file!)
}

async function save() {
  loading.value = true
  try {
    const keys: string[][] = []
    for (const group of groups.value) {
      const images: string[] = []
      for (const file of group.files) {
        if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
        const image = await counter.setImage({
          name: file.name,
          type: file.type,
          buffer: Array.from(new Uint8Array(await file.arrayBuffer())),
        })
        images.push(image.key)
      }
      keys.push(images)
    }
    before.value = keys[0] ?? []
    after.value = keys[1] ?? []
    open.value = false
  } catch (error) {
    toast.add({ title: `图片保存失败：${String(error)}`, color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UButton class="mt-3" color="neutral" variant="outline" @click="enter">
    图片消息配置（前置 {{ before.length }} / 后置 {{ after.length }}）
  </UButton>
  <USlideover
    v-model:open="open"
    side="right"
    title="AI 招呼语图片消息配置"
    description="按列表顺序发送：前置图片 → AI 招呼语 → 后置图片。确认后请保存 AI 配置。"
    :dismissible="!loading"
    :close="!loading"
    :ui="{ content: 'w-full sm:max-w-xl' }"
  >
    <template #body>
      <div class="space-y-4" :class="{ 'pointer-events-none opacity-60': loading }">
        <template v-for="(group, groupIndex) in groups" :key="group.label">
          <div v-if="groupIndex === 1" class="rounded-lg border border-default bg-elevated p-4">
            <h3 class="font-medium">AI 消息</h3>
            <p class="mt-2 text-sm text-muted">
              发送 AI 生成的招呼语；生成失败或拒绝发送时，不发送任何图片。
            </p>
          </div>
          <div class="space-y-3 rounded-lg border border-default p-4">
            <h3 class="font-medium">{{ group.label }}</h3>
            <UFileUpload
              v-model="group.files"
              multiple
              accept="image/*"
              label="上传多张图片"
              description="按列表顺序逐张发送"
            />
            <div v-for="(file, index) in group.files" :key="index" class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-sm">{{ index + 1 }}. {{ file.name }}</span>
              <UButton
                size="xs"
                color="neutral"
                :disabled="index === 0"
                @click="move(group.files, index, -1)"
                >上移</UButton
              >
              <UButton
                size="xs"
                color="neutral"
                :disabled="index === group.files.length - 1"
                @click="move(group.files, index, 1)"
                >下移</UButton
              >
              <UButton size="xs" color="error" variant="soft" @click="group.files.splice(index, 1)"
                >删除</UButton
              >
            </div>
          </div>
        </template>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" :disabled="loading" @click="open = false"
        >取消</UButton
      >
      <UButton :loading="loading" @click="save">确认</UButton>
    </template>
  </USlideover>
</template>
