<script lang="ts" setup>
import type { SelectMenuItem } from '@nuxt/ui'
import { computed, onMounted, ref, watch } from 'vue'

import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'
import { useModel } from '@/composables/useModel'
import { useResume } from '@/composables/useResume'

const toast = useToast()
const helper = useHelper()
const conf = useConf()
const models = useModel()
const resume = useResume()

const selectedFile = ref<File | null>(null)
const selectedModel = ref('')
const selectedQuery = ref('')
const autoRunTriggered = ref(false)

const employmentItems = [
  { label: '不限', value: 'any' },
  { label: '实习', value: 'internship' },
  { label: '全职', value: 'full-time' },
]
const remoteItems = [
  { label: '不限', value: 'any' },
  { label: '优先远程', value: 'preferred' },
  { label: '仅远程', value: 'required' },
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

watch(
  modelItems,
  (items) => {
    if (!selectedModel.value && items[0]) selectedModel.value = String(items[0].value)
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
    selectedQuery.value = resume.profile.value.recommendation?.searchQueries[0] ?? ''
    toast.add({ title: '简历分析完成', color: 'success' })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function savePreferences() {
  try {
    await resume.save()
    toast.add({ title: '求职偏好已保存', color: 'success' })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function enableAutoApplyDeduplication() {
  if (conf.formData.sameCompanyFilter.value && conf.formData.sameHrFilter.value) return
  conf.formData.sameCompanyFilter.value = true
  conf.formData.sameHrFilter.value = true
  await conf.confSaving()
}

function navigateToSearch(query: string) {
  const url = new URL(window.location.href)
  url.pathname = '/web/geek/jobs'
  url.searchParams.set('query', query)
  url.searchParams.delete('page')
  window.location.assign(url.toString())
}

async function searchJobs(autoApply: boolean) {
  const query = selectedQuery.value.trim()
  if (!query) {
    toast.add({ title: '请选择一个推荐搜索词', color: 'warning' })
    return
  }

  try {
    if (autoApply) await enableAutoApplyDeduplication()
    if (autoApply) {
      await resume.startSearchQueue([query])
    } else {
      await resume.setSearchRequest(query, false)
    }
    navigateToSearch(query)
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
}

async function searchAllRecommendedJobs() {
  const queries = recommendation.value?.searchQueries ?? []
  if (!queries.length) {
    toast.add({ title: '请先完成简历分析', color: 'warning' })
    return
  }

  try {
    await enableAutoApplyDeduplication()
    const firstQuery = await resume.startSearchQueue(queries)
    navigateToSearch(firstQuery)
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
        await resume.cancelSearchQueue()
        return
      }
      if (helper.workflow?.status.value !== 'stop' || helper.workflow?.errorMessage.value) {
        helper.logs.info('简历推荐', '自动搜索已暂停，未继续下一个搜索词')
        return
      }

      const nextQuery = await resume.advanceSearchQueue()
      if (nextQuery) navigateToSearch(nextQuery)
    } catch (error) {
      await resume.cancelSearchQueue()
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
    selectedQuery.value = resume.profile.value.recommendation?.searchQueries[0] ?? ''
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
            提取后的文本仅保存在扩展本地，用于生成搜索词和筛选方向。
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

    <section class="flex flex-col gap-4 border-b border-default pb-5">
      <div>
        <h3 class="text-sm font-semibold">求职偏好</h3>
        <p class="mt-1 text-sm text-muted">这些条件优先于 AI 建议，自动投递时作为硬筛选。</p>
      </div>
      <UCheckbox
        v-model="resume.profile.value.preferences.enabled"
        label="启用偏好硬筛与匹配阈值"
      />
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="城市">
          <UInputTags v-model="resume.profile.value.preferences.cities" placeholder="例如：北京" />
        </UFormField>
        <UFormField label="最低月薪（K）">
          <UInputNumber
            v-model="resume.profile.value.preferences.minSalary"
            :min="0"
            placeholder="不限"
          />
        </UFormField>
        <UFormField label="岗位类型">
          <USelectMenu
            v-model="resume.profile.value.preferences.employmentType"
            :items="employmentItems"
            value-key="value"
          />
        </UFormField>
        <UFormField label="远程">
          <USelectMenu
            v-model="resume.profile.value.preferences.remote"
            :items="remoteItems"
            value-key="value"
          />
        </UFormField>
        <UFormField label="行业">
          <UInputTags
            v-model="resume.profile.value.preferences.industries"
            placeholder="例如：互联网"
          />
        </UFormField>
        <UFormField label="公司规模">
          <UInputTags
            v-model="resume.profile.value.preferences.companySizes"
            placeholder="例如：100-499人"
          />
        </UFormField>
        <UFormField label="排除词" class="sm:col-span-2 xl:col-span-3">
          <UInputTags
            v-model="resume.profile.value.preferences.excludedKeywords"
            placeholder="例如：外包、销售"
          />
        </UFormField>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <UFormField label="匹配阈值" class="w-40">
          <UInputNumber
            v-model="resume.profile.value.preferences.matchThreshold"
            :min="0"
            :max="100"
          />
        </UFormField>
        <UButton color="neutral" variant="outline" icon="i-lucide-save" @click="savePreferences">
          保存求职偏好
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
                <li v-for="strength in recommendation.strengths" :key="strength">{{ strength }}</li>
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
            搜索按所选词发起；自动投递会在结果加载后按简历评分、硬条件和去重规则筛选。
          </p>
          <USelectMenu
            v-model="selectedQuery"
            :items="recommendation.searchQueries"
            placeholder="选择搜索词"
            class="mt-4 w-full"
          />
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
              搜索并自动投递
            </UButton>
            <UButton
              color="primary"
              variant="outline"
              icon="i-lucide-list-start"
              @click="searchAllRecommendedJobs"
            >
              全部推荐词自动投递
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
