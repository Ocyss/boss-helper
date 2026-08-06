import type { LLMInfo } from './type'

export interface other {
  other: {
    timeout?: number
    // background?: boolean
  }
}

/** AI 请求的安全超时边界，单位为毫秒。 */
export const DEFAULT_MODEL_TIMEOUT_MS = 120_000
export const MIN_MODEL_TIMEOUT_MS = 5_000
export const MAX_MODEL_TIMEOUT_MS = 600_000

/** 解析用户配置的模型超时，避免空值、负数或极端值造成立即中止或无限等待。 */
export function resolveModelTimeout(value: unknown): number {
  const timeout = Number(value)
  if (!Number.isFinite(timeout) || timeout <= 0) return DEFAULT_MODEL_TIMEOUT_MS
  return Math.min(MAX_MODEL_TIMEOUT_MS, Math.max(MIN_MODEL_TIMEOUT_MS, Math.round(timeout)))
}

export const other: LLMInfo<other>['other'] = {
  value: {
    timeout: {
      value: DEFAULT_MODEL_TIMEOUT_MS,
      type: 'input',
      format: 'number',
      config: {
        min: MIN_MODEL_TIMEOUT_MS,
        max: MAX_MODEL_TIMEOUT_MS,
        step: 1000,
      },
      desc: '模型请求超时时间，单位毫秒；范围5秒到10分钟，默认120秒。超时后停止当前岗位，不会重试发送。',
    },
    // background: {
    //   value: false,
    //   type: 'switch',
    //   desc: '是否在后台请求, 当遇到跨域错误时, 可以开启将在扩展中请求.',
    // },
  },
  alert: 'warning',
  label: '其他配置',
}

export const desc = {
  stream: '推荐开启,可以实时查看gpt返回的响应,但如果你的模型不支持,请关闭',
  max_tokens: '用处不大一般不需要调整',
  temperature: '较高的数值会使输出更加随机，而较低的数值会使其更加集中和确定',
  top_p: '影响输出文本的多样性，取值越大，生成文本的多样性越强',
}
