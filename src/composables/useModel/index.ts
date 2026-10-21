import { ref, toRaw } from 'vue'

import { counter } from '@/message'
import { logger } from '@/utils/logger'

import type { ModelConf, ModelConfData } from './type'

export * from './chatModel'

const toast = useToast()
export const confModelKey = 'conf-model'

/** Only migrate the retired protocol flag; advanced is deliberately left untouched. */
export function migrateModelConfig<T extends ModelConf>(config: T): T {
  if (!config.data) return config
  const data = { ...config.data } as ModelConfData & { responses?: boolean }
  if (!data.protocol) {
    data.protocol = data.responses === true ? 'openai-responses' : 'openai-compatible'
  }
  delete data.responses
  return { ...config, data }
}

export type { ModelConf, ModelConfData, ModelProtocol, ModelAdvanced } from './type'

const modelData = ref<ModelConf[]>([])

export const useModel = () => {
  async function init() {
    const data = await counter.storageGet<ModelConf[]>(confModelKey, [])
    logger.debug('ai模型数据', data)
    modelData.value = data.map(migrateModelConfig)
  }

  async function save(options: { silent?: boolean } = {}) {
    await counter.storageSet(confModelKey, toRaw(modelData.value))
    if (!options.silent) {
      toast.add({
        title: '保存成功',
        color: 'success',
      })
    }
  }

  return {
    initModel: init,
    modelData,
    saveModel: save,
  }
}
