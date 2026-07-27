import { reactiveComputed, useStorageAsync, watchThrottled } from '@vueuse/core'
import { reactive, ref, toRaw } from 'vue'

import { activityLog } from '@/composables/useActivityLog'
import { counter } from '@/message'
import { ExtStorage } from '@/message'
import type { ConfigLevel, FormData } from '@/types/formData'
import deepmerge, { isJsonEqual, jsonClone } from '@/utils/deepmerge'
import { exportJson, importJson } from '@/utils/jsonImportExport'
import { logger } from '@/utils/logger'

import { defaultFormData } from './info'

export * from './info'

const formDataPresetKey = 'local:FormDataPrese'
const formDataPresetsKey = 'local:FormDataPreses'

export const appearanceConf = useStorageAsync(
  'appearance-conf',
  {
    hideHeader: false,
    changeIcon: false,
    dynamicTitle: false,
    changeBackground: false,
    blurCard: false,
    listSink: false,
    contentOffset: 25, // 0-25, 25则为关闭
    leftChat: false,
    chatBoxWidth: 600,
    defaultShowChatBox: false,
  },
  ExtStorage,
  { mergeDefaults: true },
)
const isLoading = ref(true)
const isSaving = ref(false)
const formData: FormData = reactive(jsonClone(defaultFormData))
const formDataPreset = ref('default')
const formDataPresets = ref([
  {
    label: '默认配置',
    value: 'default',
  },
])

const formDataKey = () => {
  if (formDataPreset.value !== 'default') {
    return `local:web-geek-job-FormData-${formDataPreset.value}`
  }
  return 'local:web-geek-job-FormData'
}

watchThrottled(
  formData,
  (v) => {
    logger.debug('formData改变', toRaw(v))
  },
  { throttle: 2000 },
)

const FROM_VERSION: [string, (from: Partial<FormData>) => Partial<FormData>][] = [
  [
    '20250826',
    (from) => {
      if (from.salaryRange && typeof from.salaryRange.value === 'string') {
        const [min, max] = (from.salaryRange.value as string).split('-').map(Number)
        from.salaryRange.value = [min, max, false]
      }
      if (from.companySizeRange && typeof from.companySizeRange.value === 'string') {
        const [min, max] = (from.companySizeRange.value as string).split('-').map(Number)
        from.companySizeRange.value = [min, max, false]
      }
      return from
    },
  ],
  [
    '20260521',
    (from) => {
      if (from.aiFiltering?.prompt) {
        if (typeof from.aiFiltering.prompt === 'string') {
          from.aiFiltering.prompt = [
            {
              role: 'user',
              content: from.aiFiltering.prompt,
            },
          ]
        }
      } else {
        from.aiFiltering = {
          ...defaultFormData.aiFiltering,
          ...from.aiFiltering,
          prompt: defaultFormData.aiFiltering.prompt,
        }
      }
      if (from.aiGreeting?.prompt) {
        if (typeof from.aiGreeting.prompt === 'string') {
          from.aiGreeting.prompt = [
            {
              role: 'user',
              content: from.aiGreeting.prompt,
            },
          ]
        }
      } else {
        from.aiGreeting = {
          ...defaultFormData.aiGreeting,
          ...from.aiGreeting,
          prompt: defaultFormData.aiGreeting.prompt,
        }
      }
      if (from.jobAddress) {
        from.jobAddress = {
          ...from.jobAddress,
          include: true,
        }
      }
      return from
    },
  ],
  [
    '20260718',
    (from) => {
      if (!('delay' in from) || typeof from.delay !== 'object') {
        return from
      }
      Object.entries(from.delay as Record<string, number>).forEach(([key, value]) => {
        // @ts-ignore
        from[`delay${key.charAt(0).toUpperCase() + key.slice(1)}`] = value
      })
      delete from['delay']
      return from
    },
  ],
]

export const useConf = () => {
  const toast = useToast()

  async function formDataHandler(from: Partial<FormData>) {
    try {
      for (let i = FROM_VERSION.length - 1; i >= 0; i--) {
        const [version, fn] = FROM_VERSION[i]
        if ((from?.version ?? '20240401') >= version) {
          break
        }
        from = fn(from)
        from.version = version
      }
    } catch (err) {
      logger.error('用户配置初始化失败', err)
      toast.add({
        title: `用户配置初始化失败: ${String(err)}`,
        color: 'error',
      })
    }
    return from
  }

  async function loadFormData() {
    let stored = await counter.storageGet<Partial<FormData>>(formDataKey(), {})
    stored = (await formDataHandler(stored)) ?? stored
    return deepmerge<FormData>(jsonClone(defaultFormData), stored)
  }

  async function init() {
    isLoading.value = true
    try {
      const rawFormDataPreset = await counter.storageGet(formDataPresetKey, 'default')
      const rawFormDataPresets = await counter.storageGet(formDataPresetsKey, [
        {
          label: '默认配置',
          value: 'default',
        },
      ])
      formDataPreset.value = rawFormDataPreset
      formDataPresets.value = rawFormDataPresets

      const data = await loadFormData()
      Object.assign(formData, data)
    } catch (e) {
      toast.add({
        title: `配置加载失败: ${String(e)}`,
        color: 'error',
      })
      logger.error('配置加载失败', e)
    } finally {
      isLoading.value = false
    }
  }

  async function confSaving() {
    if (isSaving.value) return
    isSaving.value = true
    const v = jsonClone(formData)
    try {
      await counter.storageSet(formDataKey(), v)
      await counter.storageSet(formDataPresetKey, formDataPreset.value)
      await counter.storageSet(formDataPresetsKey, formDataPresets.value)

      const saved = await counter.storageGet<Partial<FormData> | null>(formDataKey())
      if (saved == null || !isJsonEqual(saved, v)) {
        throw new Error('浏览器存储回读校验失败')
      }

      logger.debug('formData保存成功', { key: formDataKey(), version: v.version })
      toast.add({
        title: '保存成功',
        color: 'success',
      })
      activityLog.add({
        category: '配置',
        action: '保存配置',
        status: 'success',
        message: `配置已保存到“${formDataPreset.value === 'default' ? '默认配置' : '当前预设'}”；下次自动投递会使用这些筛选条件。`,
      })
    } catch (error: any) {
      activityLog.add({
        category: '配置',
        action: '保存配置',
        status: 'error',
        message: '配置未保存；请检查浏览器存储权限后重试。',
      })
      toast.add({
        title: `保存失败: ${error.message}`,
        color: 'error',
      })
      throw error
    } finally {
      isSaving.value = false
    }
    // const helper = useHelper()
    // helper.workflow?.rebuild()
  }

  async function confReload() {
    const v = await loadFormData()
    Object.assign(formData, v)
    logger.debug('formData已重置')
    activityLog.add({
      category: '配置',
      action: '重新加载配置',
      status: 'success',
      message: '已恢复上次保存的配置；当前页面未保存的修改已被替换。',
    })
    toast.add({
      title: '重置成功',
      color: 'success',
    })
  }

  async function confExport() {
    const data = deepmerge<FormData>(defaultFormData, await counter.storageGet(formDataKey(), {}))
    exportJson(data, '打招呼配置')
    activityLog.add({
      category: '配置',
      action: '导出配置',
      status: 'success',
      message: '配置文件已导出，可用于备份或在其他浏览器中导入。',
    })
  }

  async function confImport() {
    try {
      let jsonData = await importJson<Partial<FormData>>()
      jsonData = (await formDataHandler(jsonData)) ?? jsonData
      deepmerge(formData, jsonData, { clone: false })
      activityLog.add({
        category: '配置',
        action: '导入配置',
        status: 'action_required',
        message: '配置已导入到当前页面，尚未保存；确认筛选条件后请点击保存配置。',
      })
      toast.add({
        title: '导入成功, 切记要手动保存哦',
        color: 'success',
      })
    } catch (error) {
      activityLog.add({
        category: '配置',
        action: '导入配置',
        status: 'error',
        message: '配置导入失败；请选择有效的配置文件后重试。',
      })
      throw error
    }
  }

  function confRecommend() {
    deepmerge(
      formData,
      [
        'deliveryLimit',
        'activityFilter',
        'friendStatus',
        'sameCompanyFilter',
        'sameHrFilter',
        'goldHunterFilter',
        'notification',
        'useCache',
        'delay',
      ].reduce(
        (result, key) => {
          result[key] = defaultFormData[key as keyof FormData]
          return result
        },
        {} as Record<string, any>,
      ),
      { clone: false },
    )
    logger.debug('formData推荐配置已应用')
    activityLog.add({
      category: '配置',
      action: '应用推荐设置',
      status: 'action_required',
      message: '已应用推荐设置，尚未保存；确认无误后请点击保存配置。',
    })
    toast.add({
      title: '推荐配置已应用, 不会自动保存, 请手动保存或重载恢复',
      color: 'success',
    })
  }

  function confDelete() {
    Object.assign(formData, jsonClone(defaultFormData))
    logger.debug('formData已清空')
    activityLog.add({
      category: '配置',
      action: '恢复默认设置',
      status: 'action_required',
      message: '当前页面已恢复默认设置，尚未保存；确认后请点击保存配置。',
    })
    toast.add({
      title: '配置清空成功, 不会自动保存, 请手动保存或重载恢复',
      color: 'success',
    })
  }

  const order: Record<ConfigLevel, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    expert: 4,
  }

  const configLevel = reactiveComputed(() => {
    const val = order[formData.configLevel]
    return {
      intermediate: order['intermediate'] <= val,
      advanced: order['advanced'] <= val,
      expert: order['expert'] <= val,
    }
  })

  async function createPreset(label: string) {
    isLoading.value = true
    try {
      const value = Date.now().toString()
      formDataPresets.value.push({
        label,
        value,
      })
      formDataPreset.value = value

      await counter.storageSet(formDataPresetKey, formDataPreset.value)
      await counter.storageSet(formDataPresetsKey, formDataPresets.value)
      await counter.storageSet(formDataKey(), jsonClone(formData))

      activityLog.add({
        category: '配置',
        action: '创建配置预设',
        status: 'success',
        message: `已创建并切换到“${label.trim() || '新预设'}”，当前配置已保存。`,
      })

      toast.add({
        title: '预设创建成功',
        color: 'success',
      })
    } catch (e) {
      toast.add({
        title: `预设创建失败: ${String(e)}`,
        color: 'error',
      })
      logger.error('预设创建失败', e)
      activityLog.add({
        category: '配置',
        action: '创建配置预设',
        status: 'error',
        message: '创建配置预设失败；请稍后重试。',
      })
    } finally {
      isLoading.value = false
    }
  }

  async function switchPreset(value?: string) {
    if (!value || value === formDataPreset.value) return
    isLoading.value = true
    try {
      formDataPreset.value = value
      await counter.storageSet(formDataPresetKey, value)
      Object.assign(formData, await loadFormData())
      activityLog.add({
        category: '配置',
        action: '切换配置预设',
        status: 'success',
        message: '已切换配置预设，之后的筛选和自动投递会使用这套设置。',
      })
    } catch (e) {
      toast.add({
        title: `预设切换失败: ${String(e)}`,
        color: 'error',
      })
      logger.error('预设切换失败', e)
      activityLog.add({
        category: '配置',
        action: '切换配置预设',
        status: 'error',
        message: '切换配置预设失败；请稍后重试。',
      })
    } finally {
      isLoading.value = false
    }
  }

  return {
    confInit: init,
    confSaving,
    confReload,
    confExport,
    confImport,
    confDelete,
    confRecommend,
    formDataKey,
    defaultFormData,
    formData,
    configLevel,
    formDataPreset,
    formDataPresets,
    createPreset,
    switchPreset,
    isLoading,
    isSaving,
  }
}
