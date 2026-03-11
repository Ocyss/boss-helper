import type { CookieInfo } from '@/message/background'
import { ElMessage } from 'element-plus'
import { computed, ref } from 'vue'
import { useStatistics } from '@/composables/useStatistics'
import { getRootVue } from '@/composables/useVue'
import { counter } from '@/message'
import { formDataKey, useConf } from '@/stores/conf'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

export interface UserInfo {

  userId: number
  identity: number
  encryptUserId: string
  name: string
  showName: string
  tinyAvatar: string
  largeAvatar: string
  token: string
  isHunter: boolean
  clientIP: string
  email: any
  phone: any
  brandName: any
  doubleIdentity: boolean
  recruit: boolean
  agentRecruit: boolean
  industryCostTag: number
  gender: number
  trueMan: boolean
  studentFlag: boolean
  completeDayStatus: boolean
  complete: boolean
  multiExpect: boolean
}

export const UserResumeStringOptions = {
  基本信息: false
    ? false as const
    : {
        姓名: false,
        年龄: true,
        性别: true,
        学历: true,
        求职状态: true,
        工作年限: true,
      },
  期望职位: true,
  个人优势: true,
  工作经历: true,
  项目经历: true,
  教育经历: true,
  资格证书: true,
  志愿者经历: true,
}

const info = ref<UserInfo>()
const cookieDatas = ref<Record<string, CookieInfo>>({})
const cookieTableData = computed(() => Object.values(cookieDatas.value))

const resume = ref<bossZpResumeData>()

export function useUser() {
  function getUserId(): number | string | null {
    return info.value?.userId
      ?? window?._PAGE?.uid
      ?? window?._PAGE?.userId
  }

  async function initUser() {
    const v = await getRootVue()
    const now = Date.now()
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        const userInfo = v?.$store?.state?.userInfo
        if (userInfo) {
          info.value = userInfo
          logger.debug('用户信息获取成功: ', now, userInfo)
          resolve(info.value)
          clearInterval(interval)
        }
      }, 400)
      setTimeout(() => {
        if (!info.value) {
          logger.error('获取用户信息失败', now, { root: v, info })
        }
        resolve(null)
        clearInterval(interval)
      }, 25000)
    })
  }

  async function initCookie() {
    try {
      const res = (await counter.cookieInfo()) ?? {}
      logger.debug('账户数据', res)
      cookieDatas.value = res
    }
    catch (err) {
      logger.error('获取账户数据失败', err)
      // 仅影响账户切换, 暂时不用提醒
      // ElMessage.error(`获取账户数据失败, 可尝试刷新插件: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function saveUser({ uid }: { uid: string | number | null }) {
    if (uid == null) {
      uid = getUserId()
    }

    const { formData } = useConf()

    if (uid == null) {
      throw new Error('找不到uid')
    }
    uid = String(uid)

    const val: CookieInfo = {
      uid,
      user: info.value?.showName ?? info.value?.name ?? '未知用户',
      avatar: info.value?.tinyAvatar ?? info.value?.largeAvatar ?? '',
      remark: '',
      gender: info.value?.gender === 0 ? 'man' : 'woman',
      flag: info.value?.studentFlag ? 'student' : 'staff',
      date: new Date().toLocaleString(),
      form: jsonClone(formData),
      statistics: await useStatistics().getStatistics(),
    }
    logger.debug('开始创建账户', info.value, val)
    await counter.cookieSave(val)
    return val
  }

  async function clearUser() {
    await counter.cookieClear()
  }

  async function changeUser(currentRow?: CookieInfo) {
    if (!currentRow) {
      ElMessage.error('请先选择要切换的账号')
      return
    }

    const targetAccount = jsonClone(currentRow)
    const uid = useUser().getUserId()
    if (uid != null) {
    // 保存当前账号状态
      await saveUser({ uid })
    }

    // 恢复目标账号的配置
    if (targetAccount.form) {
      await counter.storageSet(formDataKey, targetAccount.form)
    }

    if (targetAccount.statistics != null) {
      await useStatistics().setStatistics(targetAccount.statistics)
    }

    // 切换到目标账号
    await counter.cookieSwitch(targetAccount.uid)
  }

  async function deleteUser(d: CookieInfo) {
    try {
      await counter.cookieDelete(d.uid)
      delete cookieDatas.value[d.uid]
      ElMessage.success('账号删除成功')
    }
    catch (error) {
      logger.error('删除账号失败', error)
      ElMessage.error('删除账号失败，请重试')
    }
  }

  async function getUserResumeString(options: Partial<typeof UserResumeStringOptions>) {
    options = {
      ...UserResumeStringOptions,
      ...options,
    }

    const data = await getUserResumeData()
    const genUserResumeStatus = function (v: number) {
      switch (v) {
        case 0:
          return '离职-随时到岗'
        case 1:
          return '在职-暂不考虑'
        case 2:
          return '在职-考虑机会'
        case 3:
          return '在职-月内到岗'
        default:
          return '未知'
      }
    }
    let template = ''
    if (typeof options.基本信息 === 'object') {
      template += `## 基本信息`
      if (options.基本信息.姓名 && data.baseInfo?.nickName) {
        template += `\n- 姓名: ${data.baseInfo.nickName}`
      }
      if (options.基本信息.年龄 && data.baseInfo?.age) {
        template += `\n- 年龄: ${data.baseInfo.age}`
      }
      if (options.基本信息.性别 && data.baseInfo?.gender) {
        template += `\n- 性别: ${data.baseInfo.gender === 1 ? '男' : '女'}`
      }
      if (options.基本信息.学历 && data.baseInfo?.degreeCategory) {
        template += `\n- 学历: ${data.baseInfo.degreeCategory}`
      }
      if (options.基本信息.工作年限 && data.baseInfo?.workYearDesc) {
        template += `\n- 工作年限: ${data.baseInfo.workYearDesc}`
      }
      if (options.基本信息.求职状态 && data.applyStatus) {
        template += `\n- 求职状态: ${genUserResumeStatus(data.applyStatus ?? 0)}`
      }
    }
    const expectList = data.expectList?.filter(item => item?.positionType === 0)
    if (options.期望职位 && expectList && expectList.length > 0) {
      template += `\n\n## 期望职位
${expectList?.map(item => `- ${item?.positionName} ${item?.salaryDesc}`).join('\n')}`
    }
    if (options.个人优势 && data.userDesc) {
      template += `\n\n## 个人优势

<个人优势>
${data.userDesc}
</个人优势>`
    }
    if (options.工作经历 && data.workExpList != null && data.workExpList.length > 0) {
      template += `\n\n## 工作经历
${data.workExpList?.map(item => `
### ${item?.companyName} (${item?.positionName}) ${item?.startDate}-${item?.endDate}

相关技能: ${item?.emphasis?.map(e => `\`${e}\``).join(' ')}
${item?.workContent
  ? `<工作内容>
${item.workContent}
</工作内容>`
  : ''}
${item?.workPerformance
  ? `<工作业绩>
${item.workPerformance}
</工作业绩>`
  : ''}
`).join('\n')}`
    }
    if (options.项目经历 && data.projectExpList && data.projectExpList.length > 0) {
      template += `\n\n## 项目经历
${data.projectExpList?.map(item => `
### ${item?.name} (${item?.roleName}) ${item?.startDate}-${item?.endDate}
<项目描述>
${item?.projectDesc}
</项目描述>
<项目业绩>
${item?.performance}
</项目业绩>
`).join('\n')}`
    }
    if (options.教育经历 && data.educationExpList && data.educationExpList.length > 0) {
      template += `\n## 教育经历
${data.educationExpList?.map(item => `- ${item?.school} ${item?.startYear}-${item?.endYear}
    ${item?.degreeName}`).join('\n')}`
    }
    if (options.资格证书 && data.certificationList && data.certificationList.length > 0) {
      template += `\n## 资格证书:
${data.certificationList?.map(item => `- ${item?.certName}`).join('\n')}
`
    }
    if (options.志愿者经历 && data.volunteerExpList && data.volunteerExpList.length > 0) {
      template += `\n## 志愿者经历:
${data.volunteerExpList?.map(item => `- ${item?.name} ${item?.serviceLength}
    ${item?.volunteerDesc ?? item?.volunteerDescription}`).join('\n')}`
    }

    template = template.replaceAll('undefined', '')
    logger.debug('getUserResumeString', { template, data })
    return template
  }

  async function getUserResumeData(forceRefresh = false) {
    if (resume.value != null && !forceRefresh) {
      return resume.value
    }

    const token = window?.Cookie.get('bst')
    const res = await fetch(`https://www.zhipin.com/wapi/zpgeek/resume/geek/preview/data.json?_=${Date.now()}`, {
      headers: {
        Zp_token: token,
      },
    })
    const data = await res.json() as {
      code: number
      message: string
      zpData: bossZpResumeData
    }
    if (data.code !== 0) {
      ElMessage.error(`获取简历数据失败: ${data.message}`)
      throw new Error(data.message)
    }
    resume.value = data.zpData
    return data.zpData
  }
  return { info, resume, getUserResumeString, getUserResumeData, getUserId, initUser, saveUser, clearUser, changeUser, deleteUser, cookieDatas, cookieTableData, initCookie }
}

window.__q_useUser = useUser
