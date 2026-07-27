<script lang="ts" setup>
import type { SelectMenuItem } from '@nuxt/ui'
import { computed, onMounted, ref, watch } from 'vue'

import { activityLog } from '@/composables/useActivityLog'
import { useHelper } from '@/composables/useHelper'
import { useModel } from '@/composables/useModel'
import { useResume } from '@/composables/useResume'

const toast = useToast()
const helper = useHelper()
const models = useModel()
const resume = useResume()

const selectedFile = ref<File | null>(null)
const selectedModel = ref('')
const selectedQueries = ref<string[]>([])
const autoRunTriggered = ref(false)

const matchThresholdItems = [
  { label: '不按分数拦截', value: 0 },
  { label: '40 分及以上', value: 40 },
  { label: '60 分及以上（推荐）', value: 60 },
  { label: '75 分及以上', value: 75 },
]

const modelItems = computed(() =>
  models.modelData.value.map(
    (model) =>
      ({
        label: model.name,
        value: model.key,
        avatar: model.data?.avatar ? { src: model.data.avatar, alt: model.name } : undefined,
      }) as SelectMenuItem,
  ),
)
const recommendation = computed(() => resume.profile.value.recommendation)
const analysisUpdatedAt = computed(() => {
  const updatedAt = resume.profile.value.updatedAt
  return updatedAt ? new Date(updatedAt).toLocaleString('zh-CN', { hour12: false }) : ''
})
const hardFilterPreview = computed(() => {
  const form = helper.conf.formData
  const items: string[] = []
  const warnings: string[] = []
  const selected = selectedQueries.value.map((query) => query.trim()).filter(Boolean)
  const formatTerms = (name: string, value: string[], include: boolean) =>
    `${name}${include ? '包含' : '排除'}：${value.join('、')}`
  const addSelect = (
    name: string,
    value: { enable: boolean; include: boolean; value: string[] },
  ) => {
    const terms = value.value.map((item) => item.trim()).filter(Boolean)
    if (!value.enable || !terms.length) return
    items.push(formatTerms(name, terms, value.include))
    if (name === '岗位名' && !value.include) {
      for (const query of selected) {
        const hit = terms.find((term) =>
          query.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
        )
        if (hit) warnings.push(`搜索词“${query}”含岗位排除词“${hit}”，结果仍以实际岗位标题为准`)
      }
    }
  }

  addSelect('岗位名', form.jobTitle)
  addSelect('公司名', form.company)
  addSelect('工作内容', form.jobContent)
  addSelect('工作地址', form.jobAddress)
  if (form.salaryRange.enable) {
    const [min, max, strict] = form.salaryRange.value
    items.push(`薪资：${min}-${max}K（${strict ? '严格' : '宽松'}）`)
  }
  if (form.companySizeRange.enable) {
    const [min, max, strict] = form.companySizeRange.value
    items.push(`公司规模：${min}-${max}人（${strict ? '严格' : '宽松'}；缺失放行）`)
  }
  return { items, warnings }
})

watch(
  () => models.modelData.value[0]?.key,
  (key) => {
    if (!selectedModel.value && key) selectedModel.value = key
  },
  { immediate: true },
)

watch(selectedFile, async (file) => {
  if (!file) return
  try {
    await resume.importFile(file)
    toast.add({ title: `已提取 ${file.name} 的简历文本`, color: 'success' })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    selectedFile.value = null
  }
})

async function saveResumeText() {
  try {
    await resume.updateText(resume.profile.value.text)
    toast.add({ title: '简历文本已保存', color: 'success' })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function analyzeResume() {
  try {
    await resume.analyze(selectedModel.value)
    selectedQueries.value = resume.profile.value.recommendation?.searchQueries.slice(0, 1) ?? []
    toast.add({ title: '简历分析完成', color: 'success' })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function saveMatchingSettings() {
  try {
    await resume.save()
    activityLog.add({
      category: '简历',
      action: '保存匹配设置',
      status: 'success',
      message: '简历匹配设置已保存；后续自动投递会按此分数阈值筛选岗位。',
      detail: {
        enabled: resume.profile.value.matching.enabled,
        threshold: resume.profile.value.matching.matchThreshold,
      },
    })
    toast.add({ title: '简历匹配设置已保存', color: 'success' })
  } catch (error) {
    activityLog.add({
      category: '简历',
      action: '保存匹配设置',
      status: 'error',
      message: '简历匹配设置未保存；请检查浏览器存储权限后重试。',
    })
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

function navigateToSearch(query: string) {
  const url = new URL(window.location.href)
  url.pathname = '/web/geek/jobs'
  url.searchParams.set('query', query)
  url.searchParams.delete('page')
  window.location.assign(url.toString())
}

async function searchJobs(autoApply: boolean) {
  const queries = selectedQueries.value
  if (!queries.length) {
    activityLog.add({
      category: '简历搜索',
      action: '开始搜索',
      status: 'action_required',
      message: '尚未选择推荐搜索词；请选择至少一个岗位方向后再继续。',
    })
    toast.add({ title: '请至少选择一个推荐搜索词', color: 'warning' })
    return
  }
  if (!autoApply && queries.length !== 1) {
    activityLog.add({
      category: '简历搜索',
      action: '开始搜索',
      status: 'action_required',
      message: '普通搜索一次只能使用一个搜索词；请保留一个选项后再搜索。',
    })
    toast.add({
      title: '搜索岗位一次只能使用一个搜索词，请只选择一个',
      color: 'warning',
    })
    return
  }

  try {
    if (autoApply) {
      const firstQuery = await resume.startSearchQueue(queries)
      navigateToSearch(firstQuery)
    } else {
      const [query] = queries
      await resume.setSearchRequest(query, false)
      navigateToSearch(query)
    }
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function cancelSearchQueue() {
  try {
    await resume.cancelSearchQueue()
    toast.add({ title: '已停止后续自动搜索', color: 'success' })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

watch(
  [
    () => resume.profile.value.pendingAutoApply,
    () => resume.profile.value.pendingSearchQuery,
    () => helper.jobList.value.length,
  ],
  async ([pendingAutoApply, pendingSearchQuery, jobCount]) => {
    if (
      !pendingAutoApply ||
      !pendingSearchQuery ||
      jobCount === 0 ||
      autoRunTriggered.value ||
      !location.pathname.includes('/web/geek/jobs') ||
      new URL(location.href).searchParams.get('query') !== pendingSearchQuery
    ) {
      return
    }

    autoRunTriggered.value = true
    try {
      await resume.markAutoApplyStarted()
      helper.logs.info('简历推荐', `已搜索“${pendingSearchQuery}”，开始运行自动投递前自检`)
      await helper.start()
      if (!helper.preflightReport.value?.ok) {
        activityLog.add({
          category: '简历搜索',
          action: '自动投递前检查',
          status: 'action_required',
          message: '自动投递前检查未通过，队列已停止；请处理配置页提示后重新开始。',
        })
        await resume.cancelSearchQueue()
        return
      }
      if (helper.workflow?.status.value !== 'stop' || helper.workflow?.errorMessage.value) {
        activityLog.add({
          category: '简历搜索',
          action: '自动投递队列',
          status: 'action_required',
          message: '当前搜索的自动投递已暂停，暂不继续下一个搜索词；请查看任务日志处理原因。',
        })
        helper.logs.info('简历推荐', '自动搜索已暂停，未继续下一个搜索词')
        return
      }

      const nextQuery = await resume.advanceSearchQueue()
      if (nextQuery) navigateToSearch(nextQuery)
    } catch (error) {
      await resume.cancelSearchQueue()
      activityLog.add({
        category: '简历搜索',
        action: '自动投递队列',
        status: 'error',
        message: '自动投递队列已停止；请检查登录状态、网络和配置后重新开始。',
      })
      toast.add({
        title: error instanceof Error ? `自动投递已停止：${error.message}` : '自动投递已停止',
        color: 'error',
      })
    }
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    await resume.init()
    selectedQueries.value = resume.profile.value.recommendation?.searchQueries.slice(0, 1) ?? []
  } catch (error) {
    toast.add({
      title: error instanceof Error ? `简历资料加载失败: ${error.message}` : '简历资料加载失败',
      color: 'error',
    })
  }
})
</script>

<template>
  <div class="flex flex-col gap-5" data-help="简历推荐和岗位搜索">
    <div class="flex flex-col gap-3 border-b border-default pb-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold">简历推荐</h2>
          <p class="mt-1 text-sm text-muted">
            简历文本保存在扩展本地；点击 AI 分析时会发送给所选模型服务，用于生成搜索词和匹配依据。
          </p>
        </div>
        <UBadge v-if="resume.profile.value.updatedAt" color="neutral" variant="subtle">
          更新于 {{ analysisUpdatedAt }}
        </UBadge>
      </div>

      <UFileUpload
        v-model="selectedFile"
        accept=".pdf,.docx,.txt,.md,.json"
        icon="i-lucide-file-up"
        label="上传简历"
        description="支持 TXT、MD、DOCX 和含可选文本的 PDF，文件不超过 5 MB"
        class="w-full"
        :disabled="resume.isLoading.value || resume.isAnalyzing.value"
      />

      <UTextarea
        v-model="resume.profile.value.text"
        :rows="7"
        :maxrows="16"
        autoresize
        placeholder="也可以直接粘贴简历文本"
        :disabled="resume.isLoading.value || resume.isAnalyzing.value"
      />

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-save"
          :disabled="!resume.profile.value.text.trim()"
          @click="saveResumeText"
        >
          保存简历文本
        </UButton>
        <USelectMenu
          v-model="selectedModel"
          :items="modelItems"
          value-key="value"
          placeholder="选择分析模型"
          :disabled="resume.isAnalyzing.value"
          class="min-w-48"
        />
        <UButton
          color="primary"
          icon="i-lucide-sparkles"
          :loading="resume.isAnalyzing.value"
          :disabled="!resume.profile.value.text.trim() || !selectedModel"
          @click="analyzeResume"
        >
          AI 分析简历
        </UButton>
      </div>
    </div>

    <section class="flex flex-wrap items-center justify-between gap-4 border-b border-default pb-5">
      <div>
        <h3 class="text-sm font-semibold">简历匹配</h3>
        <p class="mt-1 text-sm text-muted">
          城市、薪资、岗位类型、远程、行业、规模和排除词统一在“配置”页设置；此处只控制 AI 匹配分。
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <UCheckbox v-model="resume.profile.value.matching.enabled" label="自动投递按匹配分筛选" />
        <UFormField label="最低分" class="w-48">
          <USelectMenu
            v-model="resume.profile.value.matching.matchThreshold"
            :items="matchThresholdItems"
            value-key="value"
            :search-input="false"
          />
        </UFormField>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-save"
          @click="saveMatchingSettings"
        >
          保存
        </UButton>
      </div>
    </section>

    <template v-if="recommendation">
      <div class="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <section class="flex flex-col gap-4">
          <div>
            <h3 class="text-sm font-semibold">求职画像</h3>
            <p class="mt-1 text-sm leading-6 text-muted">
              {{ recommendation.summary || '模型未提供摘要' }}
            </p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 class="text-sm font-semibold">适合岗位</h3>
              <div class="mt-2 flex flex-wrap gap-2">
                <UBadge
                  v-for="role in recommendation.targetRoles"
                  :key="role"
                  color="primary"
                  variant="subtle"
                >
                  {{ role }}
                </UBadge>
              </div>
            </div>
            <div>
              <h3 class="text-sm font-semibold">目标公司/行业</h3>
              <div class="mt-2 flex flex-wrap gap-2">
                <UBadge
                  v-for="target in recommendation.companyTargets"
                  :key="target"
                  color="neutral"
                  variant="subtle"
                >
                  {{ target }}
                </UBadge>
              </div>
            </div>
            <div>
              <h3 class="text-sm font-semibold">核心优势</h3>
              <ul class="mt-2 space-y-1 text-sm text-muted">
                <li v-for="strength in recommendation.strengths" :key="strength">
                  {{ strength }}
                </li>
              </ul>
            </div>
            <div>
              <h3 class="text-sm font-semibold">优先条件</h3>
              <ul class="mt-2 space-y-1 text-sm text-muted">
                <li v-for="requirement in recommendation.requirements" :key="requirement">
                  {{ requirement }}
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section
          class="border-l border-default pl-5 max-lg:border-l-0 max-lg:border-t max-lg:pt-5 max-lg:pl-0"
        >
          <h3 class="text-sm font-semibold">搜索与投递</h3>
          <p class="mt-1 text-sm leading-6 text-muted">
            可选多个推荐词；自动投递会按选择顺序搜索，并在结果加载后按简历评分、硬条件和去重规则筛选。
          </p>
          <USelectMenu
            v-model="selectedQueries"
            :items="recommendation.searchQueries"
            multiple
            placeholder="选择一个或多个搜索词"
            class="mt-4 w-full"
          />
          <div
            v-if="hardFilterPreview.items.length"
            class="mt-3 space-y-1 text-xs leading-5 text-muted"
          >
            <p>当前配置筛选：{{ hardFilterPreview.items.join('；') }}</p>
            <p v-for="warning in hardFilterPreview.warnings" :key="warning" class="text-warning">
              {{ warning }}
            </p>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-search"
              @click="searchJobs(false)"
            >
              搜索岗位
            </UButton>
            <UButton color="primary" icon="i-lucide-send" @click="searchJobs(true)">
              按所选词自动投递
            </UButton>
            <UButton
              v-if="resume.profile.value.autoApplyActive"
              color="warning"
              variant="outline"
              icon="i-lucide-x"
              @click="cancelSearchQueue"
            >
              停止后续队列
            </UButton>
          </div>
        </section>
      </div>
    </template>

    <div v-else class="py-8 text-center text-sm text-muted">
      上传简历后，选择已配置模型进行分析。
    </div>
  </div>
</template>
