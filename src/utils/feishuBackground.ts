import { storage } from '#imports'

export interface FeishuConfig {
  enabled: boolean
  appId: string
  appSecret: string
  appToken: string
  tableIdBoss: string
}

export interface FeishuFetchArgs {
  path: string
  body?: unknown
  query?: Record<string, string>
}

const configKey = 'local:feishu-config'
const origin = 'https://open.feishu.cn'
const tablesPath = '/open-apis/bitable/v1/apps/:app_token/tables'
let tokenCache: { credentials: string; token: string; expiresAt: number } | undefined
let tokenFlight: { credentials: string; promise: Promise<string> } | undefined
let writeQueue: Promise<unknown> = Promise.resolve()

function serialize<T>(run: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(run)
  writeQueue = result.catch(() => undefined)
  return result
}

async function readConfig(): Promise<FeishuConfig> {
  const config = await storage.getItem<FeishuConfig>(configKey)
  if (!config?.enabled) throw new Error('飞书同步未启用')
  for (const key of ['appId', 'appSecret', 'appToken'] as const) {
    if (typeof config[key] !== 'string' || !config[key].trim()) {
      throw new Error(`飞书配置缺少 ${key}`)
    }
  }
  if (!/^[A-Za-z0-9_-]+$/.test(config.appToken)) throw new Error('飞书 appToken 格式无效')
  return config
}

type ApiResponse = {
  code: number
  data?: unknown
  tenant_access_token?: string
  expire?: number
}

async function requestJson(path: string, init: RequestInit) {
  let response: Response
  try {
    response = await fetch(`${origin}${path}`, {
      ...init,
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new Error('飞书请求失败：网络异常或请求超时')
  }
  let json: ApiResponse
  try {
    json = await response.json()
  } catch {
    throw new Error(`飞书响应不是 JSON（HTTP ${response.status}）`)
  }
  if (!json || typeof json.code !== 'number') {
    throw new Error(`飞书响应格式无效（HTTP ${response.status}）`)
  }
  return { response, json }
}

function apiError(status: number, code: number): Error {
  const hints: Record<number, string> = {
    99991661: '应用凭据无效',
    99991663: '访问凭证无效',
    99991664: '访问凭证无效',
    99991668: '访问凭证无效',
    99991671: '访问凭证已过期',
    99991672: '访问凭证无效',
    99991679: '缺少应用权限',
    91403: '无多维表格访问权限，请检查应用权限和文档授权',
    1254043: '数据表不存在',
    1254045: '字段不存在，请检查 Boss 表结构',
    1254060: '字段值类型不匹配',
  }
  // 不回传远端 msg/响应体，避免其中回显凭据或请求数据。
  return new Error(
    `飞书请求失败（HTTP ${status}，code ${code}）：${hints[code] ?? '请检查应用权限、表格配置和字段类型'}`,
  )
}

async function tenantToken(config: FeishuConfig): Promise<string> {
  const credentials = JSON.stringify([config.appId, config.appSecret])
  if (tokenCache?.credentials === credentials && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token
  }
  if (tokenFlight?.credentials === credentials) return tokenFlight.promise
  const promise = (async () => {
    const { response, json } = await requestJson(
      '/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
      },
    )
    if (!response.ok || json.code !== 0) throw apiError(response.status, json.code)
    if (
      typeof json.tenant_access_token !== 'string' ||
      !json.tenant_access_token ||
      typeof json.expire !== 'number' ||
      json.expire <= 0
    ) {
      throw new Error('飞书鉴权响应缺少有效凭证或有效期')
    }
    tokenCache = {
      credentials,
      token: json.tenant_access_token,
      expiresAt: Date.now() + Math.max(0, json.expire - 60) * 1000,
    }
    return tokenCache.token
  })()
  const flight = { credentials, promise }
  tokenFlight = flight
  try {
    return await promise
  } finally {
    if (tokenFlight === flight) tokenFlight = undefined
  }
}

function resolvePath(path: string, config: FeishuConfig): string {
  if (typeof path !== 'string') throw new Error('飞书 path 必须为字符串')
  const resolved = path
    .replaceAll(':app_token', config.appToken)
    .replaceAll(':table_id', config.tableIdBoss || '')
  const prefix = `/open-apis/bitable/v1/apps/${config.appToken}/tables`
  if (
    !resolved.startsWith(prefix) ||
    !/^(?:|\/[A-Za-z0-9_-]+(?:\/(?:fields|records)(?:\/(?:[A-Za-z0-9_-]+))?)?)$/.test(
      resolved.slice(prefix.length),
    )
  ) {
    throw new Error('飞书 path 不在允许的多维表格 tables 路径白名单中')
  }
  return resolved
}

async function fetchData(args: FeishuFetchArgs, config: FeishuConfig): Promise<unknown> {
  const path = resolvePath(args.path, config)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(args.query ?? {})) {
    if (/token|secret|authorization/i.test(key)) throw new Error('飞书 query 不允许传入凭证')
    if (typeof value !== 'string') throw new Error('飞书 query 值必须为字符串')
    query.set(key, value)
  }
  const suffix = query.size ? `?${query}` : ''
  const body = args.body === undefined ? undefined : JSON.stringify(args.body)
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await tenantToken(config)
    const { response, json } = await requestJson(path + suffix, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    })
    if (response.ok && json.code === 0) return json.data
    const invalidToken =
      response.status === 401 ||
      [99991663, 99991664, 99991668, 99991671, 99991672].includes(json.code)
    if (invalidToken && attempt === 0) {
      if (tokenCache?.token === token) tokenCache = undefined
      continue
    }
    throw apiError(response.status, json.code)
  }
  throw new Error('飞书凭证刷新后请求仍然失败')
}

export async function feishuFetch(args: FeishuFetchArgs): Promise<unknown> {
  return fetchData(args, await readConfig())
}

export const bossFields = [
  {
    field_name: 'key',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: '公司唯一标识',
    is_hidden: true,
    property: null,
    type: 1,
  },
  {
    field_name: 'HR唯一标识',
    is_hidden: true,
    property: null,
    type: 1,
  },
  {
    field_name: '使用账号',
    is_hidden: true,
    property: {
      options: [],
    },
    type: 3,
  },
  {
    field_name: '使用预设',
    is_hidden: true,
    property: {
      options: [],
    },
    type: 3,
  },
  {
    field_name: '岗位名',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: '公司名',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: 'HR',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: 'HR职位',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 3,
  },
  {
    field_name: '职位简称',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: '职位描述',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: '经验要求',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 3,
  },
  {
    field_name: '学历要求',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 3,
  },
  {
    field_name: '薪资',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: '工作城市',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: '工作地址',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: '工作地址坐标',
    is_hidden: false,
    property: {
      location: {
        input_type: 'not_limit',
      },
    },
    type: 22,
  },
  {
    field_name: '技能标签',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 4,
  },
  {
    field_name: '活跃时间',
    is_hidden: false,
    property: {
      auto_fill: false,
      date_formatter: 'yyyy/MM/dd HH:mm',
    },
    type: 5,
  },
  {
    field_name: '活跃状态',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: '福利',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 4,
  },
  {
    field_name: '工作标签',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 4,
  },
  {
    field_name: '技能要求',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 4,
  },
  {
    field_name: 'HR认证',
    is_hidden: false,
    property: null,
    type: 7,
  },
  {
    field_name: '是否猎头',
    is_hidden: false,
    property: null,
    type: 7,
  },
  {
    field_name: '是否好友',
    is_hidden: false,
    property: null,
    type: 7,
  },
  {
    field_name: 'HR已验证',
    is_hidden: false,
    property: null,
    type: 7,
  },
  {
    field_name: 'HR头像',
    is_hidden: true,
    property: null,
    type: 17,
  },
  {
    field_name: '公司Logo',
    is_hidden: true,
    property: null,
    type: 17,
  },
  {
    field_name: '公司规模',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 3,
  },
  {
    field_name: '行业',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 3,
  },
  {
    field_name: '融资阶段',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 3,
  },
  {
    field_name: '公司介绍',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: '公司标签',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 4,
  },
  {
    field_name: 'AI筛选分数',
    is_hidden: false,
    property: {
      formatter: '0',
    },
    type: 2,
  },
  {
    field_name: 'AI筛选-加分项',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: 'AI筛选-扣分项',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: 'AI招呼语',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: 'AI招呼语-能力',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 4,
  },
  {
    field_name: 'AI招呼语-原因',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: 'AI招呼语-拒绝原因',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: '处理状态',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 3,
  },
  {
    field_name: '处理状态-类别',
    is_hidden: false,
    property: {
      options: [],
    },
    type: 3,
  },
  {
    field_name: '处理状态-原因',
    is_hidden: false,
    property: null,
    type: 1,
  },
  {
    field_name: '创建时间',
    is_hidden: false,
    property: {
      date_formatter: 'yyyy/MM/dd HH:mm',
    },
    type: 1001,
  },
  {
    field_name: '最后更新时间',
    is_hidden: false,
    property: {
      date_formatter: 'yyyy/MM/dd HH:mm',
    },
    type: 1002,
  },
]

export function createTableBoss(): Promise<{ tableIdBoss: string }> {
  return serialize(async () => {
    const config = await readConfig()

    const data = (await fetchData(
      {
        path: tablesPath,
        body: {
          table: {
            name: `Boss - ${new Date().toISOString()}`,
            default_view_name: '全部岗位',
            fields: bossFields,
          },
        },
      },
      config,
    )) as { table_id?: string } | undefined
    if (!data?.table_id) throw new Error('飞书建表响应缺少 table_id')
    const latest = await storage.getItem<FeishuConfig>(configKey)
    if (
      !latest ||
      latest.appToken !== config.appToken ||
      latest.appId !== config.appId ||
      latest.appSecret !== config.appSecret
    ) {
      throw new Error(
        '飞书配置在建表期间发生变化，未覆盖配置；请在原多维表格中确认已创建的 Boss 表',
      )
    }
    await storage.setItem(configKey, { ...latest, tableIdBoss: data.table_id })
    return { tableIdBoss: data.table_id }
  })
}

function text(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(text).join('')
  if (typeof value === 'object') {
    if ('text' in value) return text(value.text)
    return JSON.stringify(value)
  }
  return String(value)
}

function fieldsFor(row: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const field of bossFields) {
    if (field.type === 1001 || field.type === 1002 || !Object.hasOwn(row, field.field_name))
      continue
    const value = row[field.field_name]
    if (value === undefined) continue
    // 附件必须先上传取得 file_token，外部 URL 不能直接作为附件写入。
    if (field.type === 17 && typeof value === 'string') continue
    if (value === null) {
      fields[field.field_name] = null
      continue
    }
    if (
      field.type === 1 &&
      (typeof value === 'string' ||
        (Array.isArray(value) &&
          value.every(
            (part) =>
              part && typeof part === 'object' && 'text' in part && typeof part.text === 'string',
          )))
    ) {
      fields[field.field_name] = text(value)
    } else if (field.type === 3 && typeof value === 'string') {
      fields[field.field_name] = value
    } else if (
      field.type === 4 &&
      Array.isArray(value) &&
      value.every((option) => typeof option === 'string')
    ) {
      fields[field.field_name] = [...new Set(value)]
    } else if (field.type === 7 && typeof value === 'boolean') {
      fields[field.field_name] = value
    } else if (
      (field.type === 2 || field.type === 5) &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      (field.type !== 5 || Number.isInteger(value))
    ) {
      fields[field.field_name] = value
    } else if (field.type === 22 && typeof value === 'string') {
      fields[field.field_name] = value
    } else if (
      field.type === 17 &&
      Array.isArray(value) &&
      value.every(
        (attachment) =>
          attachment &&
          typeof attachment === 'object' &&
          'file_token' in attachment &&
          typeof attachment.file_token === 'string' &&
          attachment.file_token.trim(),
      )
    ) {
      fields[field.field_name] = value.map((attachment) => ({ file_token: attachment.file_token }))
    } else {
      throw new Error(`飞书字段 ${field.field_name} 类型无效`)
    }
  }
  return fields
}

export function feishuUpsert(
  rows: Record<string, unknown>[],
): Promise<{ created: number; updated: number }> {
  return serialize(async () => {
    const config = await readConfig()
    if (!config.tableIdBoss) throw new Error('飞书尚未配置 Boss 数据表，请先创建数据表')
    if (!Array.isArray(rows)) throw new Error('飞书 rows 必须为数组')
    const unique = new Map<string, Record<string, unknown>>()
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row))
        throw new Error('飞书行数据必须为对象')
      const key = row.key
      if (typeof key !== 'string' || !key.trim()) throw new Error('飞书行数据缺少非空字符串 key')
      unique.set(key, { ...fieldsFor(row), key })
    }
    const base = `${tablesPath}/:table_id/records`
    const existing = new Map<string, string>()
    const keys = [...unique.keys()]
    // 飞书文本 is 对多个值的解释不作为 OR 依赖，每个 key 使用单独条件。
    for (let offset = 0; offset < keys.length; offset += 50) {
      const group = keys.slice(offset, offset + 50)
      let pageToken: string | undefined
      const seen = new Set<string>()
      do {
        const data = (await fetchData(
          {
            path: `${base}/search`,
            query: { page_size: '500', ...(pageToken ? { page_token: pageToken } : {}) },
            body: {
              field_names: ['key'],
              filter: {
                conjunction: 'or',
                conditions: group.map((key) => ({
                  field_name: 'key',
                  operator: 'is',
                  value: [key],
                })),
              },
              automatic_fields: false,
            },
          },
          config,
        )) as
          | {
              items?: { record_id: string; fields: Record<string, unknown> }[]
              has_more?: boolean
              page_token?: string
            }
          | undefined
        if (!data || !Array.isArray(data.items)) throw new Error('飞书查询响应缺少 records items')
        for (const record of data.items) {
          const key = text(record.fields.key)
          if (unique.has(key) && record.record_id && !existing.has(key))
            existing.set(key, record.record_id)
        }
        pageToken = data.has_more ? data.page_token : undefined
        if (data.has_more && (!pageToken || seen.has(pageToken)))
          throw new Error('飞书查询分页凭证缺失或重复')
        if (pageToken) seen.add(pageToken)
      } while (pageToken)
    }
    const creates: { fields: Record<string, unknown> }[] = []
    const updates: { record_id: string; fields: Record<string, unknown> }[] = []
    for (const [key, fields] of unique) {
      const recordId = existing.get(key)
      if (recordId) updates.push({ record_id: recordId, fields })
      else creates.push({ fields })
    }
    for (const [operation, records] of [
      ['batch_create', creates],
      ['batch_update', updates],
    ] as const) {
      for (let offset = 0; offset < records.length; offset += 500) {
        await fetchData(
          { path: `${base}/${operation}`, body: { records: records.slice(offset, offset + 500) } },
          config,
        )
      }
    }
    return { created: creates.length, updated: updates.length }
  })
}
