import { counter } from '@/message'

type RawStore = Record<string, number>
type CacheStorage = {
  storageGet<T>(key: string, defaultValue: T): Promise<T>
  storageSet(key: string, value: RawStore): Promise<unknown>
}

/**
 * ctx 统一缓存方案：按存储 key 管理的命名集合（id -> 时间戳），
 * 按插件账号槽位隔离，支持过期清理与持久化。
 *
 * 用于「相同公司/相同HR 已投递」等去重场景。
 */
export class HelperCache {
  /** 已加载到内存的集合 */
  private stores = new Map<string, Map<string, number>>()
  /** 进行中的加载请求，避免并发重复读取存储 */
  private loading = new Map<string, Promise<Map<string, number>>>()

  constructor(
    private getAccount: () => string,
    private storage: CacheStorage = counter,
  ) {}

  private slotKey(key: string): string {
    return `${key}:${encodeURIComponent(this.getAccount())}`
  }

  /**
   * 加载（或复用）指定 key 的集合
   */
  private load(key: string): Promise<Map<string, number>> {
    const cached = this.stores.get(key)
    if (cached) return Promise.resolve(cached)

    let pending = this.loading.get(key)
    if (!pending) {
      pending = this.storage
        .storageGet<RawStore>(key, {})
        .then((raw) => {
          const map = new Map<string, number>()
          for (const [id, time] of Object.entries(raw)) {
            map.set(id, time)
          }
          this.stores.set(key, map)
          return map
        })
        .finally(() => {
          this.loading.delete(key)
        })
      this.loading.set(key, pending)
    }
    return pending
  }

  /**
   * 判断 id 是否在集合中
   */
  async has(key: string, id: string): Promise<boolean> {
    return (await this.load(this.slotKey(key))).has(id)
  }

  /**
   * 将 id 写入集合（仅内存，需配合 save 持久化）
   */
  async add(key: string, id: string, time: number = Date.now()): Promise<void> {
    ;(await this.load(this.slotKey(key))).set(id, time)
  }

  /**
   * 持久化集合，并按 expire（毫秒）清理过期项，expire <= 0 时不过期
   */
  async save(key: string, expire = 0): Promise<void> {
    const slotKey = this.slotKey(key)
    const map = await this.load(slotKey)
    if (expire > 0) {
      const deadline = Date.now() - expire
      for (const [id, time] of map) {
        if (time < deadline) {
          map.delete(id)
        }
      }
    }

    await this.storage.storageSet(slotKey, Object.fromEntries(map))
  }
}
