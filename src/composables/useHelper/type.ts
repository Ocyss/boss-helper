import type { AccordionItem, FormFieldProps, InputNumberProps } from '@nuxt/ui'

import type { ExtendedAlertProps } from '@/components/Alert.vue'
import type { BossZpBossData } from '@/entrypoints/boss/types'
import type { amapDistance, amapGeocode } from '@/utils/amap'

export type JobBaseData = {
  key: string
  link?: string
  encryptJobId?: string
  encryptBossId?: string
  encryptBrandId?: string
  /** 职位名称，例如：'前端开发工程师' */
  jobName: string
  /** 职位名称，例如：'前端工程师' */
  positionName: string

  /** 职位描述，包含岗位职责和任职要求，例如：'负责前端页面开发，熟悉Vue/React框架...' */
  jobDescription: string
}

export type JobData = JobBaseData & {
  /** 工作经验要求，例如：'3-5年' */
  experienceName: string
  /** 学历要求，例如：'本科' */
  degreeName: string
  /** 薪资描述，例如：'15-25K' */
  salary: string

  /** 工作城市地址，例如：'北京-朝阳区' */
  city?: string
  /** 工作地址，例如：'北京市朝阳区xxx大厦' */
  address?: string

  /** 工作地址的经纬度，例如：[116.397128, 39.916527] */
  addressCoords?: [number, number]

  /** 显示的技能标签，例如：['Vue', 'React', 'JavaScript', 'TypeScript', '前端开发经验'] */
  showSkills: Array<string>

  /** 活跃时间戳，例如：1640995200000 */
  activeTime?: number
  /** 活跃时间字符串，例如：'上周活跃' */
  activeTimeStr?: string

  /** 福利列表，例如：['意外险', '工龄奖', '团建聚餐'] */
  welfareList?: string[]

  /** 工作标签，如经验和学历要求，例如：['1-3年', '学历不限'] */
  jobLabels: string[]

  /** 技能要求列表，例如：['PHP', 'PHP开发经验', '服务端开发经验', '大数据项目开发经验'] */
  skills: string[]

  /** 招聘者信息 */
  boss: {
    link?: string
    /** 招聘者姓名，例如：'张经理' */
    name: string
    /** 招聘者职位，例如：'技术总监' */
    title: string
    /** 招聘者头像URL（大图），例如：'https://img.bosszhipin.com/boss/avatar/avatar_1.png' */
    avatar: string

    /** 是否认证，例如：true */
    certificated: boolean

    /** 是否猎头，例如：false */
    isHeadhunter?: boolean
    /** 是否好友，例如：false */
    isFriend?: boolean
    /** 是否在线，例如：true */
    isOnline?: boolean
    /** 是否已验证，例如：true */
    isCertificated?: boolean
  }

  /** 公司品牌信息 */
  brand: {
    link?: string
    /** 公司名称，例如：'北京科技有限公司' */
    name: string
    /** 公司Logo URL，例如：'https://img.bosszhipin.com/beijin/icon/logo.png' */
    logo: string
    /** 公司规模描述，例如：'50-150人' */
    scale: string
    /** 行业名称，例如：'互联网' */
    industry: string
    /** 融资阶段，例如：'未融资' */
    stageName?: string
    /** 公司介绍，例如：'' */
    introduce: string
    /** 公司标签，例如：[] */
    labels: Array<any>
  }
}

export interface LogData {
  jobData: JobData
  el?: Element
  amap?: {
    geocode?: Awaited<ReturnType<typeof amapGeocode>>
    distance?: Awaited<ReturnType<typeof amapDistance>>
  }
  bossData?: BossZpBossData
  message?: string
  state?: string
  err?: string
  aiFilteringQ?: string
  aiFilteringR?: string | null
  aiFilteringAjson?: object
  aiFilteringAtext?: string
  aiGreetingQ?: string
  aiGreetingR?: string | null
  aiGreetingA?: string
}

type logState = 'info' | 'success' | 'warning' | 'danger'

export interface Log {
  job?: JobData
  title: string // 标题
  state: logState // 信息,成功,过滤,出错
  state_name: string // 标签文本
  message?: string // 显示消息
  data?: LogData
}

export type AlertItem = ExtendedAlertProps & {
  type: 'alert'
}

export type ConfigItem =
  | {
      key: string
      type:
        | 'select'
        | 'checkbox'
        | (
            | 'salaryRange'
            | 'companySizeRange'
            | 'customGreeting'
            | 'address'
            | 'appearance'
            | 'checkbox-expire'
          )
    }
  | AlertItem
  | {
      type: 'div'
      items?: (ConfigItem | false)[]

      [key: string]: any
    }
  | {
      type: 'inputNumber'
      key: string
      fieldProps?: FormFieldProps
      inputNumberProps?: InputNumberProps
    }

export interface ConfigAccordionItem extends AccordionItem {
  items?: (ConfigItem | false)[]
}
