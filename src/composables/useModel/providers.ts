import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'

import { createAdvancedFetch } from '@/utils/modelRequest'

import type { ModelConfData } from './type'

export function createModel(conf: ModelConfData) {
  const settings = {
    baseURL: conf.base_url || undefined,
    apiKey: conf.api_key,
    fetch: createAdvancedFetch(conf.advanced),
  }
  if (conf.protocol === 'anthropic-messages') {
    return createAnthropic(settings)(conf.model)
  }
  const provider = createOpenAI(settings)
  return conf.protocol === 'openai-responses'
    ? provider.responses(conf.model)
    : provider.chat(conf.model)
}
