<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'

import Alert from '@/components/Alert.vue'
import { useConf } from '@/composables/conf'
import { useConfigSections } from '@/composables/conf/sections'
import { HelperKey } from '@/composables/useHelper'
import type { HelperContext } from '@/composables/useHelper'
import { useModel, ChatModel } from '@/composables/useModel'
import { counter } from '@/message'
import { exportJson } from '@/utils/jsonImportExport'

import AIPage from './pages/AIPage.vue'
import FeishuPage from './pages/FeishuPage.vue'
import GeneralPage from './pages/GeneralPage.vue'
import ManagementPage from './pages/ManagementPage.vue'
import ProvidersPage from './pages/ProvidersPage.vue'

const formDataPresetsKey = 'local:FormDataPreses'

const formDataPresets = ref([{ label: '默认配置', value: 'default' }])

async function initPresets() {
  formDataPresets.value = await counter.storageGet(formDataPresetsKey, [
    { label: '默认配置', value: 'default' },
  ])
}

const header = ref<HTMLElement>()
const headerHeight = ref(0)
useResizeObserver(header, () => {
  headerHeight.value = header.value?.getBoundingClientRect().height ?? 0
})

const toast = useToast()
const conf = useConf()
const model = useModel()
const schema = useConfigSections()
const sections = computed(() => schema.value[1].filter((item) => item !== false))
const helpText = ref('悬浮或聚焦配置项，即可在这里查看说明。')
const hoveredHelp = ref('')
const focusedHelp = ref('')

function readHelp(target: EventTarget | null) {
  if (!(target instanceof Element)) return ''
  let element: Element | null = target
  while (element) {
    const text = element.getAttribute('data-help')?.trim()
    if (text && text !== 'no-help') return text
    element = element.parentElement
  }
  return ''
}

function updateHelp(event: Event) {
  if (event.type === 'pointerover') hoveredHelp.value = readHelp(event.target)
  if (event.type === 'pointerleave') hoveredHelp.value = ''
  if (event.type === 'focusin') focusedHelp.value = readHelp(event.target)
  if (event.type === 'focusout') focusedHelp.value = readHelp((event as FocusEvent).relatedTarget)
  helpText.value =
    hoveredHelp.value || focusedHelp.value || '悬浮或聚焦配置项，即可在这里查看说明。'
}

const page = ref('general')
const activeSection = ref('basic')
const ready = ref(false)
const busy = ref(false)
const error = ref('')
const baseline = ref('')
const modelBaseline = ref('')
const aiEditor = ref<InstanceType<typeof AIPage>>()
const revision = ref(0)
const snapshot = () => JSON.stringify(conf.formData)
const modelSnapshot = () => JSON.stringify(model.modelData.value)
const dirty = computed(
  () =>
    ready.value &&
    (snapshot() !== baseline.value ||
      modelSnapshot() !== modelBaseline.value ||
      aiEditor.value?.isDirty),
)

// Configuration components expect a helper, but options has no website session or jobs.
const context = {
  key: 'boss',
  label: 'Boss直聘',
  workflowRunning: ref(false),
  statistics: { todayData: ref({ success: 0 }) },
  jobList: ref([]),
  jobMaps: new Map(),
  models: model,
  onJobCardClick: async () => {},
} as unknown as HelperContext<any, unknown, unknown>
context.chatModel = new ChatModel(context)
provide(HelperKey, context)

function markClean() {
  baseline.value = snapshot()
  modelBaseline.value = modelSnapshot()
}
function allowDiscard() {
  return (
    !dirty.value || window.confirm('存在未保存的配置或编辑器草稿，继续将丢弃这些修改。是否继续？')
  )
}
async function run(action: () => Promise<void> | void) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = false
  }
}

async function initialize() {
  await Promise.all([initPresets(), conf.confInit(), model.initModel()])
  ready.value = true
  markClean()
}

async function save() {
  await run(async () => {
    if ((await aiEditor.value?.save({ silent: true })) === false) return
    const saved = snapshot()
    const savedModels = modelSnapshot()
    await conf.confSaving({ silent: true })
    await model.saveModel({ silent: true })
    baseline.value = saved
    modelBaseline.value = savedModels
    toast.add({
      title: '配置与模型已保存',
      color: 'success',
      description: '回到投递页面记得手动刷新, 避免配置不同步',
    })
  })
}
async function reload() {
  if (!allowDiscard()) return
  await run(async () => {
    await initialize()
    revision.value++
  })
}

async function switchPreset(value: string) {
  if (value === conf.formDataPreset.value || !allowDiscard()) return
  await run(async () => {
    await conf.switchPreset(value)
    await model.initModel()
    markClean()
    revision.value++
  })
}

async function manage(action: () => Promise<unknown> | unknown, reload = true) {
  if (!allowDiscard()) return
  await run(async () => {
    if (reload) await initialize()
    await action()
    if (reload) await initialize()
    else await model.initModel()
    markClean()
    revision.value++
  })
}
async function navigate(value: string | undefined) {
  if (!value) return
  page.value = 'general'
  activeSection.value = value
  await nextTick()
  document
    .getElementById(`section-${value}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  void run(initialize)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <UApp>
    <div
      class="options-page min-h-screen bg-default text-default"
      :style="{ '--options-header-height': `${headerHeight}px` }"
      @pointerover="updateHelp"
      @focusin="updateHelp"
      @focusout="updateHelp"
      @pointerleave="updateHelp"
    >
      <header ref="header" class="sticky top-0 z-20 border-b border-default bg-default px-4 py-3">
        <div class="mx-auto max-w-240 flex items-center justify-between gap-4">
          <div>
            <h1 class="text-lg font-semibold">BossHelper 设置</h1>
          </div>
          <UBadge :color="dirty ? 'warning' : 'neutral'" variant="soft">{{
            dirty ? '有未保存修改 / 草稿' : '已同步'
          }}</UBadge>
        </div>
        <div
          class="header-help mx-auto mt-2 max-w-240 text-sm text-muted"
          role="note"
          aria-label="配置帮助"
        >
          <span class="font-medium text-default">配置帮助：</span>
          <span class="wrap-break-word text-wrap">{{ helpText }}</span>
        </div>
      </header>
      <div class="options-layout">
        <aside class="options-sidebar space-y-5">
          <div class="space-y-2 flex flex-col">
            <USelect
              :model-value="conf.formDataPreset.value"
              :items="formDataPresets"
              :disabled="!ready || busy"
              class="w-full"
              @update:model-value="switchPreset"
            />
            <UButton
              label="预设/账号管理"
              icon="i-lucide-settings"
              :variant="page === 'management' ? 'soft' : 'outline'"
              block
              :disabled="!ready || busy"
              @click="page = 'management'"
            />
          </div>
          <nav aria-label="设置目录" class="flex flex-col gap-1">
            <p class="px-2 py-1 text-xs text-muted">常规配置</p>
            <UButton
              label="基础设置"
              :variant="page === 'general' && activeSection === 'basic' ? 'soft' : 'ghost'"
              color="neutral"
              @click="navigate('basic')"
            />
            <UButton
              v-for="section in sections"
              :key="section.value"
              :label="section.label"
              :variant="page === 'general' && activeSection === section.value ? 'soft' : 'ghost'"
              color="neutral"
              @click="navigate(section.value)"
            />
            <USeparator class="my-2" />
            <UButton
              label="AI 配置"
              icon="i-lucide-sparkles"
              :variant="page === 'ai' ? 'soft' : 'ghost'"
              @click="page = 'ai'"
            />
            <UButton
              label="AI 模型配置"
              icon="i-lucide-server"
              :variant="page === 'providers' ? 'soft' : 'ghost'"
              @click="page = 'providers'"
            />
            <UButton
              label="飞书多维表格集成"
              icon="i-lucide-table-properties"
              :variant="page === 'feishu' ? 'soft' : 'ghost'"
              @click="page = 'feishu'"
            />
          </nav>
          <div class="space-y-2 border-t border-default pt-4 flex flex-col">
            <UButton
              label="导入配置"
              icon="i-lucide-upload"
              color="neutral"
              variant="outline"
              block
              :disabled="!ready || busy"
              @click="run(conf.confImport)"
            />
            <UButton
              label="导出当前配置"
              icon="i-lucide-download"
              color="neutral"
              variant="outline"
              block
              :disabled="!ready || busy"
              @click="exportJson(JSON.parse(snapshot()), 'BossHelper配置')"
            />
          </div>
        </aside>
        <main class="options-main min-w-0 flex flex-col gap-5">
          <Alert v-if="error" color="error" title="操作失败" :description="error" />
          <p v-if="!ready" role="status">
            {{ busy ? '正在加载配置…' : '配置未加载，请重试。' }}
          </p>
          <div v-if="ready" :key="revision" class="flex flex-col gap-5">
            <ManagementPage
              v-show="page === 'management'"
              :busy="busy"
              v-model="formDataPresets"
              :manage="manage"
            />
            <GeneralPage v-show="page === 'general'" :busy="busy" />
            <AIPage v-show="page === 'ai'" ref="aiEditor" />
            <ProvidersPage v-show="page === 'providers'" />
            <FeishuPage v-show="page === 'feishu'" />
          </div>
        </main>
        <aside class="options-help" aria-label="配置帮助">
          <UCard>
            <template #header><h2 class="text-sm font-semibold">配置帮助</h2></template>
            <p class="text-sm text-muted whitespace-pre-line wrap-break-word text-wrap">
              {{ helpText }}
            </p>
          </UCard>
        </aside>
      </div>
      <footer
        class="options-footer fixed inset-x-0 bottom-0 z-10 border-t border-default bg-default/95 backdrop-blur px-4 py-3"
      >
        <div class="mx-auto max-w-240 flex flex-wrap items-center gap-3">
          <UButton
            label="保存配置与模型"
            icon="i-lucide-save"
            :loading="busy"
            :disabled="!ready"
            @click="save"
          />
          <UButton
            label="重载"
            color="neutral"
            variant="outline"
            :disabled="busy"
            @click="reload"
          />
          <UButton
            label="推荐配置"
            color="neutral"
            variant="outline"
            :disabled="!ready || busy"
            @click="conf.confRecommend"
          />
          <span class="text-xs text-muted md:ml-auto">{{
            page === 'management'
              ? '管理操作即时保存'
              : page === 'feishu'
                ? '飞书配置请在页面内单独保存'
                : '修改后请点击保存'
          }}</span>
        </div>
      </footer>
    </div>
  </UApp>
</template>

<style scoped>
.options-page {
  padding-bottom: 100px;
}
.options-layout {
  display: grid;
  align-items: start;
  gap: 24px;
  padding: 20px 16px;
  max-width: 1504px;
  margin-inline: auto;
}
.options-main :deep([id^='section-']) {
  scroll-margin-top: calc(var(--options-header-height) + 20px);
}
.header-help {
  max-height: 25dvh;
  overflow-y: auto;
}
.options-main {
  width: 100%;
  max-width: 960px;
}
.options-help {
  display: none;
}
@media (min-width: 768px) {
  .options-layout {
    grid-template-columns: 200px minmax(0, 960px);
  }
  .options-sidebar {
    position: sticky;
    top: calc(var(--options-header-height) + 20px);
    max-height: calc(100dvh - var(--options-header-height) - 120px);
    overflow-y: auto;
  }
}
@media (min-width: 1440px) {
  .options-layout {
    grid-template-columns: 224px minmax(0, 960px) 224px;
  }
  .options-help {
    display: block;
    position: sticky;
    top: calc(var(--options-header-height) + 20px);
    max-height: calc(100dvh - var(--options-header-height) - 120px);
    overflow-y: auto;
  }
  .header-help {
    display: none;
  }
}
@media (max-width: 767px) {
  .options-page {
    padding-bottom: 150px;
  }
}
</style>
