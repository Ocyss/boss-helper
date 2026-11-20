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

/** 简历信息：raw 保存原文，其余字段用于提示词注入与匹配 */
export interface ResumeData {
  raw: string
  summary: string
  skills: string
  years: string
  projects: string
  updatedAt: number
}

export type ResumeStructured = Omit<ResumeData, 'raw' | 'updatedAt'>

/** 多份简历：同一份简历可以对应不同岗位方向 */
export interface ResumeProfile extends ResumeData {
  id: string
  /** 展示名称，默认取文件名 */
  name: string
  /** 用于按岗位自动选择的关键词，逗号/顿号/空格分隔 */
  keywords: string
  enable: boolean
}

/** 自动投递时段 */
export interface WorkTime {
  enable: boolean
  /** HH:mm */
  start: string
  /** HH:mm */
  end: string
}

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
  useCache: FormDataCheckbox & { expire: number }
  aiGreeting: FormDataAi & {
    json?: boolean
    beforeImages?: string[]
    afterImages?: string[]
  }
  aiFiltering: FormDataAi & { score: number }
  aiReply: FormDataAi
  resume: ResumeData
  resumeProfiles: ResumeProfile[]
  activeResumeId: string
  /** 按岗位关键词自动选择简历；关闭时只用默认简历 */
  autoSelectResume: boolean
  /** 简单模式：面板只显示开始/待发/日志 */
  simpleMode: boolean
  workTime: WorkTime
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
