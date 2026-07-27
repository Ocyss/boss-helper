import type { LLMInfo } from './type'

export interface other {
  other: {
    timeout?: number
    // background?: boolean
  }
}

export const other: LLMInfo<other>['other'] = {
  value: {
    timeout: {
      value: 18000,
      type: 'input',
      format: 'number',
      desc: 'GPT请求的超时时间,超时后不会进行重试将跳过岗位,默认18000s / 30分钟',
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
