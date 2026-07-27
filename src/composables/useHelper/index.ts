import { inject, InjectionKey } from 'vue'

import { HelperContext } from './ctx'
export { HelperContext } from './ctx'
export type { JobBaseData, JobData, LogData, Log } from './type'

export const HelperKey = Symbol() as InjectionKey<HelperContext<any, unknown, unknown>>

export const VITE_VERSION = __APP_VERSION__

export const useHelper = () => {
  const ctx = inject(HelperKey)
  if (!ctx) {
    throw new Error('useHelper must be used within a HelperProvider')
  }
  return ctx
}
