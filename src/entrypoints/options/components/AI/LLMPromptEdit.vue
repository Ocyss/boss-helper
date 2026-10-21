<script lang="ts" setup>
import type { SelectMenuItem, TableColumn } from '@nuxt/ui'
import UBadge from '@nuxt/ui/components/Badge.vue'
import UButton from '@nuxt/ui/components/Button.vue'
import UCheckbox from '@nuxt/ui/components/Checkbox.vue'
import UPopover from '@nuxt/ui/components/Popover.vue'
import { useResizeObserver, useSessionStorage } from '@vueuse/core'
import { computed, h, nextTick, reactive, ref, watch } from 'vue'

import JobCard from '@/components/JobCard.vue'
import { formInfoData, defaultFormData, useConf } from '@/composables/conf'
import { parseFiltering, parseGreeting } from '@/composables/useApplying/utils'
import type { GreetingResult } from '@/composables/useApplying/utils'
import { useHelper } from '@/composables/useHelper'
import type { JobData } from '@/composables/useHelper'
import { useModel } from '@/composables/useModel'
import { counter } from '@/message'
import type { Prompt } from '@/types/formData'
import { logger } from '@/utils/logger'

import AIEditorSurface from './AIEditorSurface.vue'
import GreetingImages from './GreetingImages.vue'

const PROMPT_TEST_JOBS_KEY = 'local:prompt-test-jobs'

const props = defineProps<{
  data: 'aiGreeting' | 'aiFiltering' | 'aiReply'
  embedded?: boolean
}>()
const toast = useToast()
const helper = useHelper()
const conf = useConf()
const model = useModel()
const show = defineModel<boolean>({ default: false })
const currentModel = ref(conf.formData[props.data].model)
const modelItems = computed(() => model.modelData.value.map((v) => v as SelectMenuItem))

const score = ref(props.data === 'aiFiltering' ? (conf.formData[props.data].score ?? 10) : 10)

const greetingJson = ref(props.data === 'aiGreeting' && !!conf.formData.aiGreeting.json)
const beforeImages = ref<string[]>([...(conf.formData.aiGreeting.beforeImages ?? [])])
const afterImages = ref<string[]>([...(conf.formData.aiGreeting.afterImages ?? [])])
const greetingJsonTemplate = `interface GreetingResult {
  greeting: string // 要发送的招呼语；拒绝发送时可省略
  reason?: string // 生成或拒绝的原因，可选
  abilities?: string[] // 分析出的能力列表，可选
  error?: string // 非空时拒绝发送，停止当前岗位投递及后续处理
}`

function toggleGreetingJson(value: boolean) {
  const warning = value
    ? '启用 JSON 模式后，必须调整 prompt，让 AI 按下方 TypeScript 模板输出 JSON 对象'
    : '关闭 JSON 模式后，必须调整 prompt，让 AI 只输出纯文本招呼语，避免将 JSON 内容直接发送给 HR'
  if (window.confirm(warning)) greetingJson.value = value
}

const role = ['system', 'user', 'assistant']

const message = ref<Prompt>(jsonClone(conf.formData[props.data].prompt))

function draftSnapshot() {
  return {
    model: currentModel.value,
    prompt: jsonClone(message.value),
    ...(props.data === 'aiFiltering' ? { score: score.value } : {}),
    ...(props.data === 'aiGreeting'
      ? {
          json: greetingJson.value,
          beforeImages: [...beforeImages.value],
          afterImages: [...afterImages.value],
        }
      : {}),
  }
}

const savedSnapshot = ref(JSON.stringify(draftSnapshot()))
const isDirty = computed(() => JSON.stringify(draftSnapshot()) !== savedSnapshot.value)

defineExpose({ save: savePrompt, isDirty })

function inputExample(json = false) {
  message.value = jsonClone(defaultFormData[props.data].prompt)
  if (props.data === 'aiGreeting' && json) {
    message.value[0]!.content += `\n\n## 输出格式（覆盖前面的 outputformat）\n仅输出 JSON 对象，不要 Markdown 或其他文字，字段遵循：\n${greetingJsonTemplate}\n成功示例：{"greeting":"您好，我具备相关开发经验，希望进一步交流。","reason":"岗位与求职者经历匹配","abilities":["TypeScript","Vue"]}\n拒绝示例：{"error":"岗位要求与求职者经历不符","reason":"缺少岗位必需的能力"}\n只根据真实求职者信息分析，不能虚构能力。成功时省略 error；不适合投递时返回非空 error。`
  }
}

function removeMessage(item: Prompt[number]) {
  message.value = message.value.filter((v) => v !== item)
}

function addMessage() {
  message.value.push({ role: 'user', content: '' })
}

const testDialog = ref(false)

interface TestData {
  key: string
  job: JobData
  loading: boolean
}
interface TestContent {
  time: string
  reasoning_content?: string | null
  content?: string
  error?: string
  greeting?: GreetingResult
}

const testData = reactive<Array<TestData>>([])
const testExpanded = ref<Record<string, boolean>>({})
const testDataContent = useSessionStorage<Record<string, TestContent[]>>(
  `prompt-test-results:${props.data}`,
  {},
)
const rowSelection = useSessionStorage<Record<string, boolean>>(
  `prompt-test-selection:${props.data}`,
  {},
)

function clearTestResults() {
  for (const key of Object.keys(testDataContent.value)) {
    delete testDataContent.value[key]
  }
  testExpanded.value = {}
}

function removeTestResult(jobKey: string, result: TestContent) {
  const results = testDataContent.value[jobKey]
  if (!results) return
  const index = results.indexOf(result)
  if (index < 0) return
  results.splice(index, 1)
  if (!results.length) delete testDataContent.value[jobKey]
}

const testTableColumns: TableColumn<TestData>[] = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsSomeRowsSelected() ? 'indeterminate' : table.getIsAllRowsSelected(),
        'onUpdate:modelValue': (value: unknown) => table.toggleAllRowsSelected(!!value),
        ariaLabel: 'Select all',
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        'onUpdate:modelValue': (value: unknown) => row.toggleSelected(!!value),
        ariaLabel: 'Select row',
      }),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'expand',
    header: '',
    cell: ({ row }) =>
      h(UButton, {
        color: 'neutral',
        variant: 'ghost',
        icon: 'i-lucide-chevron-down',
        square: true,
        size: 'xs',
        'aria-label': 'Expand',
        ui: {
          leadingIcon: [
            'transition-transform',
            row.getIsExpanded() ? 'duration-200 rotate-180' : '',
          ],
        },
        onClick: (event: MouseEvent) => {
          event.stopPropagation()
          row.toggleExpanded()
        },
      }),
  },
  {
    id: 'jobName',
    header: '岗位名',
    accessorFn: (row) => row.job.jobName,
    cell: ({ row }) =>
      h(
        UPopover,
        {
          mode: 'hover',
          portal: testModelRef.value?.parentElement ?? false,
        },
        {
          default: () =>
            h('div', { class: 'flex items-center gap-1' }, [
              row.original.loading
                ? h(UBadge, {
                    trailingIcon: 'i-line-md-loading-twotone-loop',
                    variant: 'soft',
                    color: 'neutral',
                  })
                : null,
              h('span', row.original.job.jobName),
            ]),
          content: () =>
            h(JobCard, {
              job: row.original.job,
              hover: false,
              style: 'width: 300px',
            }),
        },
      ),
  },
  {
    id: 'jobDescription',
    header: '内容',
    accessorFn: (row) => row.job.jobDescription,
    cell: ({ row }) =>
      h(
        'div',
        {
          class: 'truncate',
          title: row.original.job.jobDescription,
        },
        row.original.job.jobDescription,
      ),
  },
]

const testJobLoading = ref(false)
const testJobStop = ref(true)

watch(testDialog, async (open) => {
  if (!open) return
  testData.splice(0, testData.length)
  const jobs = await counter.storageGet<JobData[]>(PROMPT_TEST_JOBS_KEY, [])
  for (const job of jobs ?? []) {
    testData.push({ key: job.key, job, loading: false })
    if (!testDataContent.value[job.key]) {
      testDataContent.value[job.key] = []
    }
  }
  if (!testData.length) {
    toast.add({
      title: '暂无已保存的岗位数据，请先在 Boss 页面筛选栏点击「存储岗位数据」',
      color: 'warning',
    })
  }
})

async function testJob() {
  if (!testJobStop.value) {
    testJobStop.value = true
    return
  }
  const md = model.modelData.value.find((v) => currentModel.value === v.key)
  if (!currentModel.value || !md) {
    toast.add({
      title: '请先在提示词编辑区选择模型',
      color: 'warning',
    })
    return
  }
  testJobLoading.value = true
  testJobStop.value = false
  try {
    if (
      !helper.chatModel.createAgent(
        {
          prompt: message.value,
          model: currentModel.value,
          enable: true,
        },
        props.data === 'aiFiltering' ? 'filtering' : 'greetings',
        {
          json: props.data === 'aiFiltering' || (props.data === 'aiGreeting' && greetingJson.value),
        },
      )
    ) {
      throw new Error('AI模型未配置, 初始化失败')
    }
    const targets = testData.filter((item) => rowSelection.value[item.key])
    if (!targets.length) {
      toast.add({
        title: '请先勾选要测试的岗位',
        color: 'warning',
      })
      return
    }
    const handle = async (item: TestData) => {
      if (testJobStop.value) {
        return
      }
      item.loading = true
      testExpanded.value = { ...testExpanded.value, [item.key]: true }
      const result = reactive<TestContent>({
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      })
      ;(testDataContent.value[item.key] ??= []).push(result)

      try {
        const content = await helper.chatModel
          .chat(
            props.data === 'aiFiltering' ? 'filtering' : 'greetings',
            {
              jobData: item.job,
              rawData: null,
              state: {},
            },
            {
              disableMessages: true,
            },
          )
          .then((r) => Promise.all([r.text, r.finalStep.then((x) => x.reasoningText)]))
        if (props.data === 'aiFiltering' && content[0]) {
          const { message } = parseFiltering(content[0])
          content[0] = message ?? content[0]
        }
        result.reasoning_content = content[1]
        if (props.data === 'aiGreeting' && greetingJson.value) {
          result.greeting = parseGreeting(content[0])
          content[0] = ''
        }
        result.content = content[0]
        if (!result.greeting && !result.content?.trim() && !result.reasoning_content?.trim()) {
          result.error = '请求已完成，但模型未返回文本内容，请检查模型配置或提供商响应。'
        }
      } catch (err) {
        const errMsg = errorHandle(err)
        result.error = errMsg
        logger.error('TestJobError', err)
        toast.add({
          title: errMsg,
          color: 'error',
        })
      } finally {
        item.loading = false
      }
    }

    for (let i = 0; i < targets.length; i += 4) {
      const batch = targets.slice(i, i + 4)
      await Promise.all(batch.map(handle))
    }
  } catch (err: any) {
    logger.error('TestJobError', err)
    toast.add({
      title: err.message,
      color: 'error',
    })
  } finally {
    testJobLoading.value = false
    testJobStop.value = true
  }
}

async function savePrompt(options?: { silent?: boolean } | Event): Promise<boolean> {
  if (!model.modelData.value.some((item) => item.key === currentModel.value)) {
    toast.add({
      title: '请先选择有效模型；没有模型时请先在提供商管理中创建并保存',
      color: 'warning',
    })
    return false
  }
  const draft = draftSnapshot()
  conf.formData[props.data].model = draft.model
  conf.formData[props.data].prompt = draft.prompt

  if (props.data === 'aiFiltering') {
    conf.formData[props.data].score = draft.score!
  }
  if (props.data === 'aiGreeting') {
    conf.formData.aiGreeting.json = greetingJson.value
    conf.formData.aiGreeting.beforeImages = draft.beforeImages!
    conf.formData.aiGreeting.afterImages = draft.afterImages!
  }
  await conf.confSaving(options)
  savedSnapshot.value = JSON.stringify(draft)
  if (!props.embedded) show.value = false
  return true
}

const messageList = ref<HTMLElement>()
const messageInputs = ref<Array<{ autoResize: () => void }>>([])
let lastMessageWidth = 0
// Hidden panels have no measurable scrollHeight; recalculate when shown or resized.
useResizeObserver(messageList, ([entry]) => {
  const width = entry?.contentRect.width ?? 0
  if (width === lastMessageWidth) return
  lastMessageWidth = width
  if (width > 0) {
    void nextTick(() => {
      for (const input of messageInputs.value) input.autoResize()
    })
  }
})

const promptModelRef = useTemplateRef('promptModel')
const testModelRef = useTemplateRef('testModel')
</script>

<template>
  <AIEditorSurface
    v-model:open="show"
    :embedded="embedded"
    :title="formInfoData[data].label"
    :ui="{ content: 'sm:max-w-[70%]', body: 'flex flex-col gap-4' }"
    :dismissible="false"
  >
    <template #body>
      <div v-if="data === 'aiFiltering'">
        <UFormField label="过滤分数">
          <UInputNumber v-model="score" :min="-100" :max="100" size="sm" placeholder="请输入分数" />
        </UFormField>
      </div>
      <UFormField v-if="data === 'aiGreeting'" label="JSON 模式">
        <USwitch :model-value="greetingJson" @update:model-value="toggleGreetingJson" />
      </UFormField>
      <GreetingImages
        v-if="data === 'aiGreeting' && greetingJson"
        v-model:before="beforeImages"
        v-model:after="afterImages"
      />
      <pre
        v-if="greetingJson"
        class="mt-3 overflow-x-auto rounded-lg bg-elevated p-4 text-xs whitespace-pre-wrap"
        >{{ greetingJsonTemplate }}</pre>
      <div class="w-full flex flex-wrap items-center justify-between gap-3" ref="promptModel">
        <div class="flex gap-2">
          <span class="self-center text-sm text-muted">按顺序发送以下消息</span>
          <UButton color="primary" @click="addMessage"> 添加消息 </UButton>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton color="info" @click="inputExample()"> 填入纯文本示例值 </UButton>
          <UButton
            v-if="data === 'aiGreeting'"
            color="info"
            variant="soft"
            @click="inputExample(true)"
            >填入 JSON 示例值</UButton
          >
          <USelectMenu
            v-model="currentModel"
            :items="modelItems"
            labelKey="name"
            valueKey="key"
            placeholder="选择模型"
            :ui="{ content: 'min-w-fit' }"
          >
          </USelectMenu>
        </div>
      </div>
      <UAlert
        v-if="!modelItems.length"
        title="尚未配置模型"
        description="请先在提供商管理中创建模型并保存，再回到这里选择模型、编辑提示词。"
        color="info"
        variant="soft"
      />
      <p class="text-sm text-muted">
        编辑内容不会自动保存；点击「保存提示词」后生效。测试会向所选提供商发送岗位内容，可能产生费用。
      </p>
      <div ref="messageList" class="demo-dynamic space-y-4">
        <div v-for="(item, index) in message" :key="index" class="flex items-start gap-2">
          <div class="flex flex-col gap-3 w-27.5">
            <USelect v-model="item.role" :items="role" :content="{ side: 'right' }" />
            <UButton
              color="error"
              variant="outline"
              @click.prevent="removeMessage(item)"
              class="w-full"
            >
              删除
            </UButton>
          </div>
          <UTextarea
            ref="messageInputs"
            v-model="item.content"
            autoresize
            :rows="2"
            :maxrows="16"
            class="min-w-0 flex-1"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <UButton
        v-if="!embedded"
        color="neutral"
        variant="outline"
        @click="
          () => {
            show = false
          }
        "
      >
        关闭
      </UButton>
      <UButton
        color="neutral"
        variant="soft"
        @click="
          () => {
            testDialog = true
          }
        "
      >
        测试
      </UButton>
      <UButton color="primary" @click="savePrompt"> 保存提示词 </UButton>
    </template>
  </AIEditorSurface>
  <USlideover
    v-model:open="testDialog"
    title="Prompt 测试"
    :ui="{ content: 'w-full sm:max-w-5xl' }"
  >
    <template #body>
      <div class="mb-4" ref="testModel">
        <UAlert
          color="info"
          variant="soft"
          description="表格展示已在 Boss 页面保存的岗位数据，勾选后点击「开始测试」。若没有数据，请先在 Boss 页面筛选栏点击「存储岗位数据」。"
        />
      </div>
      <div class="overflow-auto">
        <UTable
          v-model:expanded="testExpanded"
          v-model:row-selection="rowSelection"
          :data="testData"
          :get-row-id="(row: TestData) => row.key"
          :columns="testTableColumns"
          :ui="{
            base: 'table-fixed w-full',
            th: 'first:w-10 nth-2:w-10 nth-3:w-1/3',
            tr: 'data-[expanded=true]:bg-elevated/40',
          }"
        >
          <template #expanded="{ row }">
            <div class="min-w-0 p-4 whitespace-normal">
              <p v-if="!testDataContent[row.original.key]?.length" class="text-sm text-muted">
                暂无测试结果，勾选岗位后点击「开始测试」。
              </p>
              <div class="space-y-4">
                <div
                  v-for="(item, index) in (testDataContent[row.original.key] ?? []).slice(-3)"
                  :key="`${row.original.key}-${item.time}-${index}`"
                  class="space-y-3 rounded-lg border border-default p-4"
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="text-xs text-muted">
                      {{ item.time }}
                    </div>
                    <UButton
                      color="error"
                      variant="ghost"
                      icon="i-lucide-x"
                      size="xs"
                      square
                      aria-label="移除此测试结果"
                      title="移除此测试结果"
                      :disabled="row.original.loading"
                      @click="removeTestResult(row.original.key, item)"
                    />
                  </div>

                  <div
                    v-if="item.reasoning_content"
                    class="whitespace-pre-wrap wrap-anywhere text-sm text-muted"
                    :title="item.reasoning_content"
                  >
                    {{ item.reasoning_content }}
                  </div>
                  <UAlert
                    v-if="item.error"
                    color="error"
                    variant="soft"
                    :description="item.error"
                  />
                  <div v-if="item.greeting" class="space-y-4">
                    <div class="rounded-lg bg-elevated p-4">
                      <p class="mb-2 text-xs font-medium text-muted">待发送招呼语</p>
                      <p class="whitespace-pre-wrap wrap-anywhere text-sm">
                        {{ item.greeting.greeting }}
                      </p>
                    </div>
                    <div v-if="item.greeting.reason">
                      <p class="mb-1 text-xs font-medium text-muted">分析原因</p>
                      <p class="whitespace-pre-wrap wrap-anywhere text-sm">
                        {{ item.greeting.reason }}
                      </p>
                    </div>
                    <div v-if="item.greeting.abilities?.length" class="flex flex-wrap gap-2">
                      <UBadge
                        v-for="(ability, abilityIndex) in item.greeting.abilities"
                        :key="abilityIndex"
                        variant="soft"
                        >{{ ability }}</UBadge
                      >
                    </div>
                  </div>
                  <div v-if="item.content" class="whitespace-pre-wrap wrap-anywhere text-sm">
                    {{ item.content }}
                  </div>
                  <p
                    v-if="
                      row.original.loading &&
                      index === Math.min(testDataContent[row.original.key]?.length ?? 0, 3) - 1
                    "
                    class="text-sm text-muted"
                    role="status"
                  >
                    正在生成，请稍候…
                  </p>
                </div>
              </div>
            </div>
          </template>
        </UTable>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center justify-between gap-2">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-trash-2"
          :disabled="!Object.values(testDataContent).some((results) => results.length)"
          @click="clearTestResults"
        >
          清空结果
        </UButton>
        <div class="flex gap-2">
          <UButton color="neutral" variant="outline" @click="close"> 取消 </UButton>
          <UButton color="primary" @click="testJob">
            {{ testJobStop ? '开始测试' : '停止测试' }}
          </UButton>
        </div>
      </div>
    </template>
  </USlideover>
</template>
