<script lang="ts" setup>
import { computed, ref } from 'vue'

import { useHelper } from '@/composables/useHelper'
import type { Log } from '@/composables/useHelper/type'

const helper = useHelper()
const selected = ref<Log | null>(null)
const rows = computed(() => [...helper.logs.value].reverse())

function clearLogs() {
  helper.logs.clear()
  selected.value = null
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <div class="text-sm text-gray-500">
        默认只显示脱敏任务阶段和错误原因；开启“详细诊断日志”后会增加耗时、超时配置和错误分类，仍不保存
        Prompt、模型响应或 Cookie。
      </div>
      <UButton size="sm" color="warning" variant="outline" @click="clearLogs">清空日志</UButton>
    </div>
    <div
      v-if="rows.length === 0"
      class="rounded border border-dashed p-6 text-center text-gray-400"
    >
      暂无投递日志；开始受控测试后，失败原因会立即出现在这里。
    </div>
    <div v-else class="overflow-auto rounded border">
      <button
        v-for="(item, index) in rows"
        :key="`${item.title}-${index}`"
        class="flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-gray-50"
        type="button"
        @click="selected = item"
      >
        <UBadge
          :color="
            item.state === 'danger' ? 'error' : item.state === 'success' ? 'success' : 'neutral'
          "
        >
          {{ item.state_name }}
        </UBadge>
        <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
        <span class="max-w-[55%] truncate text-sm text-gray-500">{{
          item.message || '无附加原因'
        }}</span>
        <time v-if="item.time" class="text-xs text-gray-400">{{
          new Date(item.time).toLocaleTimeString()
        }}</time>
      </button>
    </div>
    <UModal
      :open="selected !== null"
      title="日志详情"
      @update:open="(open) => !open && (selected = null)"
    >
      <template #body>
        <div v-if="selected" class="flex flex-col gap-2 text-sm">
          <div><strong>岗位：</strong>{{ selected.title }}</div>
          <div><strong>阶段：</strong>{{ selected.state_name }}</div>
          <div class="whitespace-pre-wrap">
            <strong>原因：</strong>{{ selected.message || '无附加原因' }}
          </div>
          <div class="text-xs text-gray-400">原始岗位和 AI 内容已脱敏，不在日志详情中展开。</div>
        </div>
      </template>
      <template #footer>
        <UButton @click="selected = null">关闭</UButton>
      </template>
    </UModal>
  </div>
</template>
