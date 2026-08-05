/**
 * V2 的独立命名空间。
 *
 * 官方扩展与 V2 可能同时运行，因此所有自定义元素、消息事件和本地存储
 * 键都必须带有独立前缀，避免互相发现、覆盖或响应对方的消息。
 */
export const BOSS_HELPER_V2_PREFIX = 'boss-helper-v2'

export const BOSS_HELPER_V2_DOM = {
  job: 'boss-helper-v2-job',
  menu: 'boss-helper-v2-menu',
  filterWrapper: 'boss-helper-v2-external-wrapper',
  jobWarp: 'boss-helper-v2-job-warp',
  loggerFrame: 'boss-helper-v2-iframe',
  loader: 'boss-helper-v2-loader',
} as const

export const BOSS_HELPER_V2_MESSAGE_EVENT = '_boss-helper-v2-message_'
export const BOSS_HELPER_V2_BACKGROUND_NAMESPACE = '__boss-helper-v2-background__'
export const BOSS_HELPER_V2_CONTENT_NAMESPACE = '__boss-helper-v2-content__'

/** 返回 V2 专用的本地存储键；不使用 sync storage 保存凭据或候选人画像。 */
export function v2StorageKey(key: string): string {
  return `local:${BOSS_HELPER_V2_PREFIX}:${key}`
}
