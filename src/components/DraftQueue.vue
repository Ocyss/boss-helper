<script lang="ts" setup>
import { computed, ref } from 'vue'

import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

const helper = useHelper()
const conf = useConf()
const toast = useToast()

const drafts = computed(() => helper.workflow?.drafts)
const rows = computed(() => {
  const map = drafts.value
  if (!map) return []
  return Array.from(map.entries()).map(([key, text]) => {
    const data = helper.jobMaps.get(key)
    return {
      key,
      text,
      job: data?.jobData,
    }
  })
})

const editingKey = ref('')
const editingText = ref('')
const busyKey = ref('')

function startEdit(key: string, text: string) {
  editingKey.value = key
  editingText.value = text
}

function saveEdit(key: string) {
  if (!editingText.value.trim()) return
  drafts.value?.set(key, editingText.value)
  editingKey.value = ''
}

async function send(key: string) {
  const text = drafts.value?.get(key)
  if (!text?.trim()) return
  busyKey.value = key
  try {
    await helper.deliverJob(key)
    toast.add({ title: '已发送并投递', color: 'success' })
  } catch (error) {
    toast.add({
      title: '发送失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    busyKey.value = ''
  }
}

function skip(key: string) {
  drafts.value?.delete(key)
  helper.filterJob(key)
  toast.add({ title: '已跳过该岗位', color: 'neutral' })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-semibold">待发队列</h3>
        <p class="text-sm text-muted">
          {{
            conf.formData.simpleMode
              ? '先点「开始筛选并生成」生成招呼语，在这里逐条确认、编辑后发送。默认不会自动发送。'
              : '先点「仅生成」生成招呼语，在这里逐条确认、编辑后发送。默认不会自动发送。'
          }}
        </p>
      </div>
      <UBadge color="neutral" variant="subtle">{{ rows.length }} 条</UBadge>
    </div>

    <div v-if="!rows.length" class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted">
      暂无待发岗位。{{
        conf.formData.simpleMode
          ? '回到「开始」页点「开始筛选并生成」'
          : '回到「统计」页点「开始仅生成」'
      }}，生成完成后会出现在这里。
    </div>

    <div v-for="row in rows" :key="row.key" class="rounded-lg border border-default p-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ row.job?.jobName || '未知岗位' }}</span>
            <UBadge v-if="row.job?.salary" color="neutral" variant="subtle">{{ row.job.salary }}</UBadge>
          </div>
          <p class="mt-1 text-sm text-muted">
            {{ row.job?.brand?.name || '未知公司' }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UButton size="xs" color="neutral" variant="subtle" @click="startEdit(row.key, row.text)">
            编辑
          </UButton>
          <UButton
            size="xs"
            color="primary"
            :loading="busyKey === row.key"
            :disabled="!!busyKey"
            @click="send(row.key)"
          >
            发送
          </UButton>
          <UButton size="xs" color="error" variant="subtle" :disabled="!!busyKey" @click="skip(row.key)">
            跳过
          </UButton>
        </div>
      </div>

      <template v-if="editingKey === row.key">
        <UTextarea v-model="editingText" :rows="3" autoresize class="mt-3 w-full" />
        <div class="mt-2 flex justify-end gap-2">
          <UButton size="xs" color="neutral" variant="subtle" @click="editingKey = ''">取消</UButton>
          <UButton size="xs" color="primary" @click="saveEdit(row.key)">保存</UButton>
        </div>
      </template>
      <p v-else class="mt-3 rounded-md bg-elevated p-3 text-sm whitespace-pre-wrap">{{ row.text }}</p>
    </div>
  </div>
</template>
