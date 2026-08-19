import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

import { desc, other } from './common'
import { extensionFetch } from './extensionFetch'
import {
  getOpenCodeGoApi,
  isOpenCodeGoBaseUrl,
  OPENCODE_GO_BASE_URL,
  OPENCODE_GO_MODEL_IDS,
} from './opencodeGo'
import type { LLMConf, LLMInfo } from './type'

export { isOpenCodeGoBaseUrl, OPENCODE_GO_BASE_URL } from './opencodeGo'

export type OpenaiLLMConf = LLMConf<
  'openai',
  {
    avatar: string
    base_url: string
    api_key: string
    model: string
    responses?: boolean
    other: other['other']
    advanced: {
      json?: boolean | true
      stream?: boolean | true

      temperature?: number
      top_p?: number
      presence_penalty?: number
      frequency_penalty?: number

      tool_choice?: string
      tools?: Array<Record<string, any>>

      extra_headers?: Record<string, string>
      extra_body?: object
    }
  }
>

export function normalizeOpenAiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, '')
  const withoutChatCompletions = trimmed.replace(/\/chat\/completions$/u, '')

  try {
    const url = new URL(withoutChatCompletions)
    const pathname = url.pathname.replace(/\/+$/u, '')
    if (url.hostname === 'opencode.ai' && (pathname === '/zen/go' || pathname === '/zen/go/v1')) {
      return OPENCODE_GO_BASE_URL
    }
  } catch {
    return withoutChatCompletions
  }

  return withoutChatCompletions
}

const info: LLMInfo<OpenaiLLMConf> = {
  mode: {
    mode: 'openai',
    label: 'OpenAI',
  },
  avatar: {
    type: 'input',
    format: 'avatar',
    required: true,
  },
  base_url: {
    desc: '可使用中转/代理API, 前提是符合openai的规范, 需要填写base api地址。OpenCode Go 订阅请填 https://opencode.ai/zen/go/v1',
    type: 'input',
    // format: 'menu', // TODO: 修复用户体验, 当前创建有问题, 要多次回车/点击
    config: {
      placeholder: 'https://api.openai.com/v1',
      items: [
        'https://api.openai.com/v1',
        OPENCODE_GO_BASE_URL,
        'https://openrouter.ai/api/v1',
        'https://api.deepseek.com',
        'https://api.moonshot.cn/v1',
        'https://token-plan-sgp.xiaomimimo.com/v1',
        'https://ark.cn-beijing.volces.com/api/v3',
      ],
      createItem: 'always',
    },
    required: true,
  },
  api_key: { type: 'input', required: true },
  model: {
    config: {
      placeholder: 'gpt-4o-mini',
      items: [
        'gpt-4o',
        'gpt-5.4',
        'deepseek-chat',
        'doubao-seed-2-0-pro-260215',
        'mimo-v2.5-pro',
        'mimo-v2.5',
        'kimi-k2.6',
        'deepseek-v4-flash',
        'minimax-m2.7',
        'deepseek-v3.2',
      ],
      createItem: 'always',
    },
    value: 'deepseek-chat',
    type: 'input',
    // format: 'menu',
    required: true,
  },
  responses: {
    value: false,
    type: 'switch',
    desc: '默认使用ChatCompletions',
  },
  other,
  advanced: {
    label: '高级配置',
    alert: 'warning',
    desc: '小白勿动',
    value: {
      json: {
        value: true,
        type: 'switch',
        desc: '仅支持较新的模型,会强制gpt返回json格式,效果好一点,能有效减少响应解析错误',
        config: {
          disabled: true,
        },
      },
      stream: {
        value: false,
        type: 'switch',
        desc: desc.stream,
        config: {
          disabled: true,
        },
      },
      temperature: {
        type: 'slider',
        config: {
          min: 0,
          max: 2,
          step: 0.05,
        },
        desc: '较高的值（如 0.8）将使输出更加随机，而较低的值（如 0.2）将使其更加集中和确定性。<br/>我们通常建议更改此项或 top_p ，但不要同时更改两者。',
      },
      top_p: {
        type: 'slider',
        config: {
          min: 0,
          max: 1,
          step: 0.05,
        },
        desc: '温度采样的替代方法称为核采样，其中模型考虑具有 top_p 概率质量的标记的结果。因此 0.1 意味着仅考虑包含前 10% 概率质量的标记。<br/>我们通常建议更改此项或 temperature ，但不要同时更改两者。',
      },
      presence_penalty: {
        value: 0,
        type: 'slider',
        config: {
          min: -2,
          max: 2,
          step: 0.1,
        },
        desc: '正值根据新标记是否出现在文本中来对其进行惩罚，从而增加模型讨论新主题的可能性。',
      },
      frequency_penalty: {
        type: 'slider',
        config: {
          min: -2,
          max: 2,
          step: 0.1,
        },
        desc: '正值根据迄今为止文本中的现有频率对新标记进行惩罚，从而降低模型逐字重复同一行的可能性。',
      },
      tool_choice: {
        type: 'input',
        format: 'menu',
        config: {
          items: ['auto', 'none'],
          createItem: true,
        },
        desc: '工具使用策略, auto表示模型根据输入自动决定是否使用工具, none表示不使用工具',
        condition: 'responses',
      },
      tools: {
        type: 'input',
        format: 'json',
        desc: '暂时仅支持model自带tool, 例如: [{"type": "web_search"}]',
        condition: 'responses',
      },
      extra_headers: {
        type: 'input',
        format: 'json',
        desc: '额外的请求头, 可以用来传一些特殊的认证信息, 例如x-access-token等, 需要填写json格式字符串, 例如{"x-access-token":"xxxx"}',
      },
      extra_body: {
        type: 'input',
        format: 'json',
        desc: '额外的请求体参数, 可以用来传一些特殊的参数, 需要填写json格式字符串, 例如{"key":"value"}',
      },
    },
  },
}

export function getOpenaiFormInfo(conf: Partial<OpenaiLLMConf>): LLMInfo<OpenaiLLMConf> {
  if (!isOpenCodeGoBaseUrl(normalizeOpenAiBaseUrl(conf.base_url ?? ''))) return info

  return {
    ...info,
    base_url: {
      ...info.base_url,
      desc: 'OpenCode Go 订阅网关地址，一般保持 https://opencode.ai/zen/go/v1 即可',
    },
    api_key: {
      ...info.api_key,
      desc: '在 OpenCode Zen 控制台订阅 Go 后复制 API Key',
    },
    model: {
      type: 'input',
      format: 'menu',
      required: true,
      value: 'deepseek-v4-flash',
      desc: 'Go 会按模型自动选择 Responses / Chat Completions / Anthropic Messages，无需手动切换协议',
      config: {
        placeholder: 'deepseek-v4-flash',
        items: [...OPENCODE_GO_MODEL_IDS],
        createItem: 'always',
      },
    },
    responses: {
      ...info.responses,
      desc: 'OpenCode Go 会按模型自动选择协议，此项会被忽略',
    },
  }
}

const createModel = (conf: OpenaiLLMConf) => {
  const baseURL = normalizeOpenAiBaseUrl(conf.base_url)
  const headers = conf.advanced.extra_headers

  if (isOpenCodeGoBaseUrl(baseURL)) {
    const api = getOpenCodeGoApi(conf.model)
    // MAIN world 在 zhipin.com 下会触发 CORS，Go 请求改走扩展后台。
    // 只创建无状态 LanguageModel，不持有 conversation / previous_response_id。
    if (api === 'responses') {
      return createOpenAI({
        baseURL,
        apiKey: conf.api_key,
        headers,
        fetch: extensionFetch,
      }).responses(conf.model)
    }
    if (api === 'messages') {
      return createAnthropic({
        name: 'opencode-go',
        baseURL,
        apiKey: conf.api_key,
        headers,
        fetch: extensionFetch,
      }).languageModel(conf.model)
    }
    return createOpenAICompatible({
      name: 'opencode-go',
      baseURL,
      apiKey: conf.api_key,
      headers,
      fetch: extensionFetch,
    }).chatModel(conf.model)
  }

  const openaiProvider = createOpenAI({
    baseURL,
    apiKey: conf.api_key,
    headers,
  })
  if (conf.responses) {
    return openaiProvider.responses(conf.model)
  }
  return openaiProvider.chat(conf.model)
}

export const openai = {
  createModel,
  info,
}
