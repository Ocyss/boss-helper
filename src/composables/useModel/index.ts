import { ref, toRaw } from 'vue'

import { counter } from '@/message'
import { logger } from '@/utils/logger'
import { v2StorageKey } from '@/utils/namespace'

import type { OpenaiLLMConf } from './openai'
import { openai } from './openai'

export * from './chatModel'

const toast = useToast()
export const confModelKey = v2StorageKey('models')
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
    let data = await counter.storageGet<ModelConf[]>(confModelKey, [])
    // 仅在 V2 首次启动时读取旧配置并复制到 local 命名空间，不删除官方扩展配置。
    if (data.length === 0) {
      const legacy = await counter.storageGet<ModelConf[]>('conf-model', [])
      if (legacy.length > 0) {
        data = legacy
        await counter.storageSet(confModelKey, legacy)
      }
    }
    logger.debug('AI模型配置已加载', { count: data.length, models: data.map((item) => item.name) })
    modelData.value = data
  }

  async function save() {
    await counter.storageSet(confModelKey, toRaw(modelData.value))
    toast.add({
      title: '保存成功',
      color: 'success',
    })
  }

  return {
    initModel: init,
    modelData,
    saveModel: save,
  }
}
