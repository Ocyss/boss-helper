import { reactiveComputed, useStorageAsync, watchThrottled } from '@vueuse/core'
import { reactive, ref, toRaw } from 'vue'

import { counter } from '@/message'
import { ExtStorage } from '@/message'
import type { ConfigLevel, FormData } from '@/types/formData'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
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
const formData: FormData = reactive(defaultFormData)
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
        from.salaryRange.value = [min ?? 0, max ?? 0, false]
      }
      if (from.companySizeRange && typeof from.companySizeRange.value === 'string') {
        const [min, max] = (from.companySizeRange.value as string).split('-').map(Number)
        from.companySizeRange.value = [min ?? 0, max ?? 0, false]
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
  [
    '20260816',
    (from) => {
      from.useCache = { value: true }
      return from
    },
  ],
]

export const useConf = () => {
  const toast = useToast()

  async function formDataHandler(from: Partial<FormData>) {
    try {
      for (let i = FROM_VERSION.length - 1; i >= 0; i--) {
        const [version, fn] = FROM_VERSION[i]!
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

      let from = await counter.storageGet<Partial<FormData>>(formDataKey(), {})
      from = (await formDataHandler(from)) ?? from
      const data = deepmerge<FormData>(defaultFormData, from)
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
    try {
      await counter.storageSet(formDataKey(), jsonClone(formData))
      await counter.storageSet(formDataPresetKey, jsonClone(formDataPreset.value))
      await counter.storageSet(formDataPresetsKey, jsonClone(formDataPresets.value))

      toast.add({
        title: '保存成功',
        color: 'success',
      })
      logger.debug('formData保存')
    } catch (error: any) {
      toast.add({
        title: `保存失败: ${error.message}`,
        color: 'error',
      })
      throw error
    }
    // const helper = useHelper()
    // helper.workflow?.rebuild()
  }

  async function confReload() {
    const v = deepmerge<FormData>(defaultFormData, await counter.storageGet(formDataKey(), {}))
    deepmerge(formData, v, { clone: false })
    logger.debug('formData已重置')
    toast.add({
      title: '重置成功',
      color: 'success',
    })
  }

  async function confExport() {
    const data = deepmerge<FormData>(defaultFormData, await counter.storageGet(formDataKey(), {}))
    exportJson(data, '打招呼配置')
  }

  async function confImport() {
    let jsonData = await importJson<Partial<FormData>>()
    jsonData = (await formDataHandler(jsonData)) ?? jsonData
    deepmerge(formData, jsonData, { clone: false })
    toast.add({
      title: '导入成功, 切记要手动保存哦',
      color: 'success',
    })
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
    )
    logger.debug('formData推荐配置已应用')
    toast.add({
      title: '推荐配置已应用, 不会自动保存, 请手动保存或重载恢复',
      color: 'success',
    })
  }

  function confDelete() {
    deepmerge(formData, defaultFormData)
    logger.debug('formData已清空')
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
    } finally {
      isLoading.value = false
    }
  }

  async function switchPreset(value: string) {
    isLoading.value = true
    try {
      formDataPreset.value = value
      await counter.storageSet(formDataPresetKey, value)
      await init()
    } catch (e) {
      toast.add({
        title: `预设切换失败: ${String(e)}`,
        color: 'error',
      })
      logger.error('预设切换失败', e)
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
  }
}
