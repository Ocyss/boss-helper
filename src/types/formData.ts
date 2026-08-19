export interface Statistics {
  date: string
  success: number
  total: number
  repeat: number
  activityFilter: number
  tasks: {
    [key: string]: { [key: string]: number }
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
  sameCompanyFilter: FormDataCheckbox & { expire?: number }
  sameHrFilter: FormDataCheckbox & { expire?: number }
  goldHunterFilter: FormDataCheckbox
  notification: FormDataCheckbox
  useCache: FormDataCheckbox
  aiGreeting: FormDataAi
  aiFiltering: FormDataAi & { score: number }
  aiReply: FormDataAi
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
  refreshSearchEveryPages: number
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
  prefilterPhrases?: string[]
  llmTriggerWords?: string[]
  compactJd?: {
    noiseWords?: string[]
  }
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
