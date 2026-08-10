import { reactiveComputed, useStorageAsync, watchThrottled } from '@vueuse/core'
import { reactive, ref, toRaw } from 'vue'

import { counter } from '@/message'
import { ExtStorage } from '@/message'
import type { ConfigLevel, FormData } from '@/types/formData'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { exportJson, importJson } from '@/utils/jsonImportExport'
import { logger } from '@/utils/logger'
import { v2StorageKey } from '@/utils/namespace'

import { defaultFormData } from './info'

export * from './info'

const formDataPresetKey = v2StorageKey('form-data-preset')
const formDataPresetsKey = v2StorageKey('form-data-presets')

export const appearanceConf = useStorageAsync(
  v2StorageKey('appearance-conf'),
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
    return v2StorageKey(`form-data-${formDataPreset.value}`)
  }
  return v2StorageKey('form-data')
}

watchThrottled(
  formData,
  (v) => {
    logger.debug('formData改变', { keys: Object.keys(toRaw(v)) })
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
  [
    '20260808',
    (from) => {
      // 新增高风险功能默认关闭；旧配置即使没有字段也不能意外启用图片发送。
      if (!from.batchPause || typeof from.batchPause !== 'object') {
        from.batchPause = { ...defaultFormData.batchPause }
      }
      if (!from.resumeImage || typeof from.resumeImage !== 'object') {
        from.resumeImage = { ...defaultFormData.resumeImage }
      } else {
        from.resumeImage = {
          ...defaultFormData.resumeImage,
          ...from.resumeImage,
          enable: false,
        }
      }
      return from
    },
  ],
  [
    '20260809',
    (from) => {
      // 兼容旧版迁移循环只执行最新迁移：补齐上一版新增字段并保持高风险功能关闭。
      if (!from.batchPause || typeof from.batchPause !== 'object') {
        from.batchPause = { ...defaultFormData.batchPause }
      }
      if (!from.resumeImage || typeof from.resumeImage !== 'object') {
        from.resumeImage = { ...defaultFormData.resumeImage }
      } else {
        from.resumeImage = {
          ...defaultFormData.resumeImage,
          ...from.resumeImage,
          enable: false,
        }
      }
      // 新增兜底语默认关闭；保留用户已填写的文本，但不让升级过程意外触发发送。
      const fallback = from.greetingFallback
      from.greetingFallback =
        fallback && typeof fallback === 'object'
          ? {
              ...defaultFormData.greetingFallback,
              ...fallback,
              enable: false,
            }
          : { ...defaultFormData.greetingFallback }
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
    // 旧版只有固定延迟数字；首次加载时转换成 min=max，随后由运行时加入有界抖动。
    const source = from as Partial<FormData> & { delayRanges?: FormData['delayRanges'] }
    if (!source.delayRanges) {
      const value = (key: keyof FormData, fallback: number): number => {
        const candidate = source[key]
        return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : fallback
      }
      source.delayRanges = {
        starts: [
          value('delayDeliveryStarts', defaultFormData.delayDeliveryStarts),
          value('delayDeliveryStarts', defaultFormData.delayDeliveryStarts),
          false,
        ],
        interval: [
          value('delayDeliveryInterval', defaultFormData.delayDeliveryInterval),
          value('delayDeliveryInterval', defaultFormData.delayDeliveryInterval),
          false,
        ],
        pageNext: [
          value('delayDeliveryPageNext', defaultFormData.delayDeliveryPageNext),
          value('delayDeliveryPageNext', defaultFormData.delayDeliveryPageNext),
          false,
        ],
        message: [
          value('delayMessageSending', defaultFormData.delayMessageSending),
          value('delayMessageSending', defaultFormData.delayMessageSending),
          false,
        ],
      }
    }
    // 统一限制批次长等待配置，避免导入异常数字导致无等待或超长等待。
    const rawBatchPause = source.batchPause
    const batchPause =
      rawBatchPause && typeof rawBatchPause === 'object'
        ? rawBatchPause
        : defaultFormData.batchPause
    const asPositiveInt = (value: unknown, fallback: number) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : fallback
    }
    const afterMin = asPositiveInt(batchPause.afterMin, defaultFormData.batchPause.afterMin)
    const afterMax = Math.max(
      afterMin,
      asPositiveInt(batchPause.afterMax, defaultFormData.batchPause.afterMax),
    )
    const waitMinSeconds = asPositiveInt(
      batchPause.waitMinSeconds,
      defaultFormData.batchPause.waitMinSeconds,
    )
    const waitMaxSeconds = Math.max(
      waitMinSeconds,
      asPositiveInt(batchPause.waitMaxSeconds, defaultFormData.batchPause.waitMaxSeconds),
    )
    source.batchPause = {
      enable: batchPause.enable === true,
      afterMin,
      afterMax,
      waitMinSeconds,
      waitMaxSeconds,
    }
    // 兜底文本只保留短文本和布尔开关；导入异常对象时回到默认关闭状态。
    const rawFallback = source.greetingFallback
    source.greetingFallback =
      rawFallback && typeof rawFallback === 'object'
        ? {
            enable: rawFallback.enable === true,
            value: typeof rawFallback.value === 'string' ? rawFallback.value.slice(0, 300) : '',
          }
        : { ...defaultFormData.greetingFallback }
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
    // 重载也必须经过同一套迁移和边界归一化，避免旧配置让批次范围变成空值。
    let from = await counter.storageGet<Partial<FormData>>(formDataKey(), {})
    from = (await formDataHandler(from)) ?? from
    const v = deepmerge<FormData>(defaultFormData, from)
    deepmerge(formData, v, { clone: false })
    logger.debug('formData已重置')
    toast.add({
      title: '重置成功',
      color: 'success',
    })
  }

  async function confExport() {
    const data = deepmerge<FormData>(defaultFormData, await counter.storageGet(formDataKey(), {}))
    // 图片二进制位于本机 IndexedDB，导出只保留不发送的空占位，避免把个人简历带出本机。
    data.resumeImage = { ...defaultFormData.resumeImage }
    exportJson(data, '打招呼配置')
  }

  async function confImport() {
    let jsonData = await importJson<Partial<FormData>>()
    jsonData = (await formDataHandler(jsonData)) ?? jsonData
    // 导入文件不能携带本机 IndexedDB 图片引用；用户必须在当前设备重新选择图片。
    jsonData.resumeImage = { ...defaultFormData.resumeImage }
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
        'batchPause',
        'resumeImage',
        'greetingFallback',
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
      counter.storageSet(formDataPresetKey, value)
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
