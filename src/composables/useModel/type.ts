import type {
  InputProps,
  InputNumberProps,
  InputMenuProps,
  SwitchProps,
  SliderProps,
  SelectMenuProps,
} from '@nuxt/ui'

export type LLMConf<M extends string, T> = { mode: M } & T

export type FormElm =
  | { type: 'input'; config?: InputProps; format?: 'url' | 'json' | 'avatar' }
  | {
      type: 'input'
      format: 'number'
      config?: InputNumberProps
    }
  | {
      type: 'input'
      format: 'menu'
      config?: InputMenuProps
    }
  | { type: 'slider'; config?: SliderProps }
  | { type: 'switch'; config?: SwitchProps }
  | { type: 'select'; config?: SelectMenuProps }

type IsStructuredObject<T> =
  T extends Record<string, any> ? (string extends keyof T ? false : true) : false

export type LLMInfoValM<T, F extends object> = {
  value: { [K in keyof F]: LLMInfoValF<T, F[K]> }
  label?: string
  desc?: string
  alert: 'success' | 'warning' | 'info' | 'error'
}

export type LLMInfoValF<T, F> = {
  value?: F
  label?: string
  desc?: string
  condition?: string | ((val: T) => boolean)
} & FormElm &
  (undefined extends F ? { required?: boolean } : { required: true })

export type LLMInfoVal<T, F> =
  IsStructuredObject<F> extends true ? LLMInfoValM<T, Extract<F, object>> : LLMInfoValF<T, F>

export type LLMInfo<T extends object> = {
  [K in keyof T]-?: K extends 'mode'
    ? {
        mode: T[K]
        label: string
        icon?: string
        desc?: string
        disabled?: boolean
      }
    : LLMInfoVal<T, T[K]>
}
