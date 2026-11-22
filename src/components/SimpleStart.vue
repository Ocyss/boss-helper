<script lang="ts" setup>
import { computed } from 'vue'

import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'
import { useJobActions } from '@/composables/useJobActions'
import { counter } from '@/message'

const conf = useConf()
const helper = useHelper()
const actions = useJobActions()
const toast = useToast()

const running = computed(
  () => helper.workflow?.status.value === 'running' || Boolean(helper.workflow?.busy.value),
)
const profiles = computed(() => conf.formData.resumeProfiles ?? [])
const resumeCount = computed(() => {
  const count = profiles.value.filter(
    (profile) => profile.enable && (profile.summary.trim() || profile.raw.trim()),
  ).length
  if (count) return count
  return conf.formData.resume.summary || conf.formData.resume.raw ? 1 : 0
})
const draftCount = computed(() => helper.workflow?.drafts.size ?? 0)
const ready = computed(
  () => conf.formData.aiGreeting.enable && Boolean(conf.formData.aiGreeting.model) && resumeCount.value > 0,
)

function start() {
  if (!ready.value) {
    const missing = [
      !conf.formData.aiGreeting.enable || !conf.formData.aiGreeting.model ? 'API Key/模型' : '',
      !resumeCount.value ? '简历' : '',
    ].filter(Boolean)
    toast.add({
      title: `请先在「配置」里完成：${missing.join('、')}`,
      color: 'warning',
    })
    return
  }
  void actions.run('生成招呼语', () => helper.start('generate'))
}

function openOptions() {
  void counter.openOptionsPage()
}

function stop() {
  helper.stop()
}

function openAdvanced() {
  conf.formData.simpleMode = false
  void conf.confSaving({ silent: true })
}
</script>

<template>
  <div class="flex flex-col gap-4 p-1">
    <div class="grid grid-cols-3 gap-3">
      <div class="rounded-lg border border-default p-3">
        <div class="text-xs text-muted">模型</div>
        <div class="mt-1 font-semibold">
          {{ conf.formData.aiGreeting.model ? '已配置' : '未配置' }}
        </div>
      </div>
      <div class="rounded-lg border border-default p-3">
        <div class="text-xs text-muted">简历</div>
        <div class="mt-1 font-semibold">{{ resumeCount }} 份</div>
      </div>
      <div class="rounded-lg border border-default p-3">
        <div class="text-xs text-muted">待发</div>
        <div class="mt-1 font-semibold">{{ draftCount }} 条</div>
      </div>
    </div>

    <UButton block size="lg" :loading="running" :disabled="running" @click="start">
      {{ running ? '正在筛选并生成…' : '开始筛选并生成招呼语' }}
    </UButton>

    <UButton v-if="running" block color="error" variant="outline" @click="stop">
      停止生成（已生成的草稿会保留）
    </UButton>

    <p v-if="running" class="text-center text-sm text-warning">
      生成中也可以到「待发」发送已生成的草稿；发送会立即联系 HR。
    </p>

    <p class="text-center text-sm text-muted">
      只生成草稿，不会自动发送；生成后到「待发」逐条确认。
    </p>

    <div class="flex justify-center gap-2">
      <UButton color="neutral" variant="outline" @click="openOptions">配置</UButton>
      <UButton color="neutral" variant="ghost" @click="openAdvanced">高级模式</UButton>
    </div>
  </div>
</template>
