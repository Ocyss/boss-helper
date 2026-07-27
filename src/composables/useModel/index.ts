import { ref } from 'vue'

import { counter } from '@/message'
import { isJsonEqual, jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

import type { OpenaiLLMConf } from './openai'
import { openai } from './openai'

export * from './chatModel'

const toast = useToast()
export const confModelKey = 'local:conf-model'
const legacyConfModelKey = 'sync:conf-model'
export const llms = [openai.info]

export type ModelConfData = OpenaiLLMConf

export interface ModelConf {
  key: string
  name: string
  color?: string
  data?: ModelConfData
  // vip?: {
  //   description: string
  //   price: {
  //     input: string
  //     output: string
  //   }
  // }
}

const modelData = ref<ModelConf[]>([])

export const useModel = () => {
  async function init() {
    let data = await counter.storageGet<ModelConf[] | null>(confModelKey)
    if (data == null) {
      data = await counter.storageGet<ModelConf[]>(legacyConfModelKey, [])
      if (data.length > 0) {
        await counter.storageSet(confModelKey, data)
        await counter.storageRm(legacyConfModelKey)
      }
    }
    logger.debug('AI模型配置已加载', { count: data.length })
    modelData.value = jsonClone(data)
  }

  async function save() {
    const data = jsonClone(modelData.value)
    try {
      await counter.storageSet(confModelKey, data)
      const saved = await counter.storageGet<ModelConf[] | null>(confModelKey)
      if (saved == null || !isJsonEqual(saved, data)) {
        throw new Error('浏览器存储回读校验失败')
      }
      toast.add({
        title: '保存成功',
        color: 'success',
      })
    } catch (error) {
      logger.error('AI模型配置保存失败', error)
      toast.add({
        title: `保存失败: ${error instanceof Error ? error.message : String(error)}`,
        color: 'error',
      })
      throw error
    }
  }

  return {
    initModel: init,
    modelData,
    saveModel: save,
  }
}
