export interface Statistics {
  date: string
  /** 成功建立沟通，保留 success 字段名以兼容历史数据。 */
  success: number
  /** 招呼消息成功提交到聊天通道。 */
  greetingSuccess: number
  total: number
  repeat: number
  activityFilter: number
  tasks: {
    [key: string]: { [key: string]: number }
  }
  tracking?: {
    total: string[]
    success: string[]
    greetingSuccess: string[]
    repeat: string[]
    activityFilter: string[]
    tasks: {
      [taskId: string]: { [status: string]: string[] }
    }
  }
}
const ConfigLevels = ['beginner', 'intermediate', 'advanced', 'expert'] as const
export type ConfigLevel = (typeof ConfigLevels)[number]

export interface FormData {
  configLevel: ConfigLevel
  company: FormDataSelect
  jobTitle: FormDataSelect
  jobContent: FormDataSelect
  hrPosition: FormDataSelect
  jobAddress: FormDataSelect
  salaryRange: FormSalaryRangeInput
  companySizeRange: FormDataRangeInput
  customGreeting: FormDataInput
  deliveryLimit: FormDataInputNumber
  greetingVariable: FormDataCheckbox
  activityFilter: FormDataCheckbox
  friendStatus: FormDataCheckbox
  bossGoldMedalHr: FormDataCheckbox
  sameCompanyFilter: FormDataCheckbox
  sameHrFilter: FormDataCheckbox
  goldHunterFilter: FormDataCheckbox
  notification: FormDataCheckbox
  useCache: FormDataCheckbox
  aiGreeting: FormDataAi
  aiFiltering: FormDataAi & { score: number }
  aiReply: FormDataAi
  companyRisk: CompanyRiskConfig
  chatAutomation: ChatAutomationConfig
  amap: {
    key: string
    origins: string
    straightDistance: number
    drivingDistance: number
    drivingDuration: number
    walkingDistance: number
    walkingDuration: number
    enable: boolean
  }
  record: { model?: string[]; enable: boolean }
  // animation?: "frame" | "card" | "together";
  delayDeliveryStarts: number
  delayDeliveryInterval: number
  delayDeliveryPageNext: number
  delayMessageSending: number
  version: string

  [key: string]: any
}

export interface FormInfoAi {
  label: string
  'data-help'?: string
}

export interface FormDataSelect {
  include: boolean
  value: string[]
  options: string[]
  enable: boolean
}

export interface FormDataInput {
  value: string | Array<CustomGreetingItem>
  enable: boolean
}

export type FormDataRange = [number, number, boolean]

export interface FormDataRangeInput {
  value: FormDataRange
  enable: boolean
}

export interface FormSalaryRangeInput {
  // 宽松/严格 默认宽松false
  value: FormDataRange // 8-13K
  advancedValue: {
    H: FormDataRange // 45-75元/时
    D: FormDataRange // 360-600元/天
    M: FormDataRange // 8000-13000元/月
  }
  enable: boolean
}

export interface FormDataInputNumber {
  value: number
}

export interface FormDataCheckbox {
  value: boolean
}

export type Prompt = Array<{
  role: 'system' | 'user' | 'assistant'
  content: string
}>

export interface FormDataAi {
  model?: string
  prompt: Prompt
  enable: boolean
}

export type CompanyRiskProvider = 'none' | 'tianyancha' | 'qichacha' | 'custom'

export interface CompanyRiskConfig {
  enable: boolean
  blockThreshold: number
  external: {
    provider: CompanyRiskProvider
    endpoint: string
    apiKey: string
    apiSecret: string
    headers: string
    cacheMinutes: number
  }
}

export type ChatAutomationMode = 'remind' | 'suggest' | 'confirm' | 'auto'

export type ChatAllowlistTarget = 'company' | 'hr' | 'job' | 'hr-id'
export type ChatAllowlistMatchMode = 'exact' | 'contains'

export interface ChatAllowlistRule {
  target: ChatAllowlistTarget
  matchMode: ChatAllowlistMatchMode
  value: string
}

export interface ChatAutomationConfig {
  enable: boolean
  mode: ChatAutomationMode
  browserNotification: boolean
  pagePopup: boolean
  blockReadReceipts: boolean
  quietStart: string
  quietEnd: string
  // Legacy string entries remain supported when loading an older local configuration.
  allowlist: Array<ChatAllowlistRule | string>
  keywords: string[]
  manualReviewKeywords: string[]
  maxRepliesPerConversation: number
  cooldownMinutes: number
  dailyReplyLimit: number
}

export type CustomGreetingItemText = {
  type: 'text'
  content: string
}

export type CustomGreetingItemImage = {
  type: 'image'
  // image: Record<
  //   string,
  //   { meta?: any; model?: File } & (
  //     | { url: string; base64?: undefined }
  //     | { url?: undefined; base64: string }
  //   )
  // >
  image: string
  model?: File
}

export type CustomGreetingItem = CustomGreetingItemText | CustomGreetingItemImage
