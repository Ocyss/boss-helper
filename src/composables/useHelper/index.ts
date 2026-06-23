// =============================================================================
// useHelper 模块 - HelperContext 的依赖注入入口
// 提供全局唯一的 HelperContext 实例注入和类型导出
// =============================================================================

import { inject, InjectionKey } from 'vue'

import { HelperContext } from './ctx'
// 导出抽象基类 HelperContext（运行时类，运行时和类型双重导出）
export { HelperContext } from './ctx'
// 导出类型定义（纯类型，仅用于类型检查，编译后被擦除）
// 注意：必须用 export type 导出，否则 Vite 8 (rolldown) 会报 MISSING_EXPORT 错误
export type { JobBaseData, JobData, LogData, Log } from './type'

// 依赖注入的 InjectionKey，用于在 Vue 组件树中定位 HelperContext 实例
export const HelperKey = Symbol() as InjectionKey<HelperContext<any, unknown, unknown>>

// 从构建环境注入的版本号（来自 wxt.config.ts 的 define）
export const VITE_VERSION = __APP_VERSION__

/**
 * 获取当前组件注入的 HelperContext 实例
 * 必须在 HelperProvider 的子组件中调用，否则抛出异常
 */
export const useHelper = () => {
  const ctx = inject(HelperKey)
  if (!ctx) {
    throw new Error('useHelper must be used within a HelperProvider')
  }
  return ctx
}
