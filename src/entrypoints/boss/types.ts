import { DeepPartial } from '@nuxt/ui'

export interface BossZpBossData {
  data: {
    bossFreezeStatus: number
    companyName: string
    tinyUrl: string
    title: string
    mobileVisible: number
    encryptJobId: string
    regionCode: string
    bothTalked: boolean
    encryptBossId: string
    warningTips: any[]
    bossId: number
    weixinVisible: number
    mobile: string
    securityId: string
    bossPreFreezeStatus: number
    weixin: string
    curTime: number
    isTop: number
    name: string
    hasInterview: boolean
    bossSource: number
  }
  job: {
    jobName: string
    salaryDesc: string
    brandName: string
    locationName: string
    proxyJob: number
    proxyType: number
    jobSource: number
    degreeName: string
    lowSalary: number
    highSalary: number
    experienceName: string
  }
}

/**
 * 职位信息,在模板中通常使用 data 获取
 * 如 {{ data.jobName }} 获取工作名称
 */
export interface BossZpJobItemData {
  /** 安全标识符，例如：'MkH058uX...' */
  securityId: string
  /** 招聘者头像的URL，例如：'https://img.bosszhipin.com/boss/avatar.png' */
  bossAvatar: string
  /** 招聘者认证等级，例如：3 */
  bossCert: number
  /** 加密后的招聘者ID，例如：'4e3d3f84...' */
  encryptBossId: string
  /** 招聘者姓名，例如：'周靖丰' */
  bossName: string
  /** 招聘者职称，例如：'招聘者' */
  bossTitle: string
  /** 是否是金牌猎头（0为否，1为是），例如：0 */
  goldHunter: number
  /** 招聘者是否在线，例如：false */
  bossOnline: boolean
  /** 加密后的工作ID，例如：'ee226d37...' */
  encryptJobId: string
  /** 预期ID，可能用于追踪求职者的应聘活动，例如：89300700003 */
  expectId: number
  /** 工作名称，例如：'PHP' */
  jobName: string
  /** 日志ID，可能用于追踪或日志系统，例如：'6VzQgg0000...' */
  lid: string
  /** 薪资描述，例如：'8-13K' */
  salaryDesc: string
  /** 工作标签，如经验和学历要求，例如：['1-3年', '学历不限'] */
  jobLabels: string[]
  /** 工作有效状态，例如：1 */
  jobValidStatus: number
  /** 图标文字，例如：'' */
  iconWord: string
  /** 技能要求列表，例如：['PHP', 'PHP开发经验', '服务端开发经验', '大数据项目开发经验'] */
  skills: string[]
  /** 工作经验要求，例如：'1-3年' */
  jobExperience: string
  /** 每周工作天数描述，例如：'' */
  daysPerWeekDesc: string
  /** 最短工作月数描述，例如：'' */
  leastMonthDesc: string
  /** 学历要求，例如：'学历不限' */
  jobDegree: string
  /** 城市名称，例如：'成都' */
  cityName: string
  /** 地区/县，例如：'双流区' */
  areaDistrict: string
  /** 商业区域，例如：'华阳' */
  businessDistrict: string
  /** 工作类型标识，例如：0 */
  jobType: number
  /** 是否代理工作，例如：0 */
  proxyJob: number
  /** 代理类型，例如：0 */
  proxyType: number
  /** 是否匿名发布，例如：0 */
  anonymous: number
  /** 是否为境外工作，例如：0 */
  outland: number
  /** 是否为优选职位，例如：0 */
  optimal: number
  /** 图标标记列表，例如：[] */
  iconFlagList?: any[]
  /** 物品ID，例如：1 */
  itemId: number
  /** 城市编码，例如：101270100 */
  city: number
  /** 是否被屏蔽，例如：0 */
  isShield: number
  /** 是否直接通过ATS发布，例如：false */
  atsDirectPost: boolean
  /** GPS位置，例如：null */
  gps: {
    longitude: number
    latitude: number
  }
  // 职位名称后方的图标列表
  afterNameIcons: Array<any>
  // 职位名称前方的图标列表
  beforeNameIcons: Array<any>
  /** 最后修改时间（时间戳），例如：1710067550000 */
  lastModifyTime?: number
  /** 加密后的品牌ID，例如：'6d13c740...' */
  encryptBrandId: string
  /** 品牌名称，例如：'御坂网络' */
  brandName: string
  /** 品牌Logo的URL，例如：'https://img.bosszhipin.00000098.png.webp' */
  brandLogo: string
  /** 品牌阶段名称，例如：'' */
  brandStageName: string
  /** 品牌所属行业，例如：'互联网' */
  brandIndustry: string
  /** 品牌规模描述，例如：'20-99人' */
  brandScaleName: string
  /** 福利列表，例如：['意外险', '工龄奖', '团建聚餐'] */
  welfareList: string[]
  /** 行业编码，例如：100020 */
  industry: number
  /** 是否已沟通 */
  contact: boolean
  // 是否显示为置顶职位
  showTopPosition: boolean
}

/**
 * 简历数据
 */
export type BossZpResumeData = DeepPartial<{
  baseInfo: {
    name: string
    nickName: string
    tiny: string
    birthday: string
    age: string
    gender: number
    degree: number
    degreeCategory: string
    account: string
    emailBlur: string
    weixinBlur: string
    freshGraduate: number
    workYears: number
    nameShowType: number
    bossCert: number
    userCert: number
    certGender: boolean
    certBirth: boolean
    startWorkDate: number
    applyStatus: number
    workYearDesc: string
    resumeStatus: number
    resumeCount: number
    complete: boolean
    weiXinSecurityUid: any
    garbageFieldList: any
    hometown: number
    hometownName: any
    studyAbroadCertPass: number
    highestEduExp: any
    showF3Optimize: number
    startWorkDateDesc: string
    birthdayDesc: string
  }
  userDesc: string
  applyStatus: number
  lastUpdateTime: string
  workEduDesc: string
  expectList: Array<{
    id: string
    position: number
    positionName: string
    customPositionId: string
    positionType: number
    location: number
    locationName: string
    subLocation: number
    subLocationName: any
    lowSalary: number
    highSalary: number
    salaryDesc: string
    industryList: Array<{
      code: number
      name: string
    }>
    industryDesc: string
    suggestPosition: string
    applyStatus: number
    freshGraduate: number
    doneWorkPositionList: any
    garbageFieldList: any
    interestPositionList: any
    interestLocationList: any
    industryExpect: boolean
    tagName: any
  }>
  workExpList: Array<{
    id: string
    companyName: string
    industry: {
      code: number
      name: string
    }
    department: string
    customPositionName: string
    position: number
    positionName: string
    positionLv2: number
    startDate: string
    startDateStr: string
    endDate: string
    endDateStr: string
    emphasis: Array<string>
    workContent: string
    workPerformance: string
    isPublic: number
    workType: number
    suggestToDel: number
    garbageFieldList: any
  }>
  projectExpList: Array<{
    id: string
    name: string
    roleName: string
    url: string
    startDate: string
    endDate: string
    projectDesc: string
    performance: string
    suggestToDel: number
    garbageFieldList: any
    endDateStr: string
    startDateStr: string
  }>
  educationExpList: Array<{
    id: string
    schoolId: number
    school: string
    major: string
    degree: number
    eduType: number
    degreeName: string
    startYear: string
    endYear: string
    educationDesc: string
    country: any
    tags: any
    schoolType: number
    suggestToDel: number
    thesisTitle: string
    thesisDesc: string
    majorRanking: number
    courseList: Array<any>
    badge: string
    garbageFieldList: any
    startYearStr: string
    endYearStr: string
  }>
  socialContactList: any
  volunteerExpList: Array<{
    id: string
    name: string
    serviceLength: string
    startDate: string
    endDate: string
    volunteerDesc: string
    garbageFieldList: any
    endDateStr: string
    volunteerDescription: string
    startDateStr: string
  }>
  certificationList: Array<{
    certId: string
    certName: string
    certStatus: number
    certType: number
  }>
  trainingExpList: any
  designWorksImage: any
  designWorksVideo: any
  personalImage: any
  deliciousFoodImage: any
  garbage: {
    status: number
    reasonCode: number
    resumeDetailStatus: number
    garbageBaseInfo: any
    baseInfo: any
    garbageUserDesc: any
    personalAdvantages: any
    garbageWorkExp: any
    workExp: any
    garbageEduExp: any
    eduExp: any
    garbageProjectExp: any
    projectExp: any
    garbageVolunteerExp: any
    volunteerExp: any
    garbageExpectList: any
    expect: any
    garbageCertificationList: any
    certification: any
    designWorks: any
    designWorksImageList: any
    designWorksVideoList: any
    garbageHandicapped: any
    handicapped: any
    trainingExp: any
    clubExp: any
    professionalSkill: any
    honor: any
  }
  editStatus: {
    canAddExpect: boolean
    canAddWorkExp: boolean
    canAddProjectExp: boolean
    canAddEduExp: boolean
    canAddSocialContact: boolean
  }
  doneWorkPositionList: Array<any>
  handicappedInfo: any
  postExpList: Array<any>
  myLabels: any
  clubExpList: Array<any>
  professionalSkill: string
  honorList: Array<any>
  feature: {
    showNewPositionStyle: number
    showHandicappedModule: number
    showResumeImportBtn: number
    showResumeImportBtnRedDot: boolean
    showResumeFillHelper: number
    showTrainingExpModule: number
    showF3Optimize: number
    showPostExpModule: number
    webResumeLabelModule: number
    expectLocationInterestCombine: number
    stuMultiExpectChoose: number
  }
  virtualPartTimeCombineExpect: any
}>

/**
 * Boss直聘职位详情数据
 * 包含职位详细信息、招聘者信息、公司信息等完整数据
 */
export interface BossZpDetailData {
  /** 页面类型，例如：0 */
  pageType: number
  /** 是否自己访问，例如：false */
  selfAccess: boolean
  /** 安全标识符，用于请求验证，例如：'abc123def456...' */
  securityId: string
  /** 会话ID，例如：null */
  sessionId: any
  /** 日志ID，用于追踪，例如：'abc123.search.35' */
  lid: string
  /** 职位详细信息 */
  jobInfo: {
    /** 加密后的职位ID，例如：'abc123def456...' */
    encryptId: string
    /** 加密后的用户ID，例如：'xyz789uvw012...' */
    encryptUserId: string
    /** 职位是否无效，例如：false */
    invalidStatus: boolean
    /** 职位名称，例如：'前端开发工程师' */
    jobName: string
    /** 职位编码，例如：100123 */
    position: number
    /** 职位名称，例如：'前端工程师' */
    positionName: string
    /** 城市编码，例如：101280600 */
    location: number
    /** 城市名称，例如：'北京' */
    locationName: string
    /** 城市URL，例如：'/c101010100/' */
    locationUrl: string
    /** 工作经验要求，例如：'3-5年' */
    experienceName: string
    /** 学历要求，例如：'本科' */
    degreeName: string
    /** 工作类型，例如：0 */
    jobType: number
    /** 是否代理职位，例如：0 */
    proxyJob: number
    /** 代理类型，例如：0 */
    proxyType: number
    /** 薪资描述，例如：'15-25K' */
    salaryDesc: string
    /** 薪资类型描述，例如：null */
    payTypeDesc: any
    /** 职位描述，包含岗位职责和任职要求，例如：'负责前端页面开发，熟悉Vue/React框架...' */
    postDescription: string
    /** 加密后的地址ID，例如：'def456ghi789...' */
    encryptAddressId: string
    /** 工作地址，例如：'北京市朝阳区xxx大厦' */
    address: string
    /** 经度，例如：116.397128 */
    longitude: number
    /** 纬度，例如：39.916527 */
    latitude: number
    /** 静态地图URL（移动端） */
    staticMapUrl: string
    /** 静态地图URL（PC端） */
    pcStaticMapUrl: string
    /** 百度静态地图URL（移动端） */
    baiduStaticMapUrl: string
    /** 百度静态地图URL（PC端） */
    baiduPcStaticMapUrl: string
    /** 海外地址列表，例如：[] */
    overseasAddressList: Array<any>
    /** 海外信息，例如：null */
    overseasInfo: any
    /** 显示的技能标签，例如：['Vue', 'React', 'JavaScript', 'TypeScript', '前端开发经验'] */
    showSkills: Array<string>
    /** 是否匿名发布，例如：0 */
    anonymous: number
    /** 职位状态描述，例如：'最新' */
    jobStatusDesc: string
  }
  /** 招聘者信息 */
  bossInfo: {
    /** 招聘者姓名，例如：'张经理' */
    name: string
    /** 招聘者职位，例如：'技术总监' */
    title: string
    /** 招聘者头像URL（小图），例如：'https://img.bosszhipin.com/boss/avatar/avatar_1.png' */
    tiny: string
    /** 招聘者头像URL（大图），例如：'https://img.bosszhipin.com/boss/avatar/avatar_1.png' */
    large: string
    /** 活跃时间描述，例如：'今日活跃' */
    activeTimeDesc: string
    /** 招聘者是否在线，例如：false */
    bossOnline: boolean
    /** 公司名称，例如：'北京科技有限公司' */
    brandName: string
    /** 招聘者来源，例如：0 */
    bossSource: number
    /** 是否认证，例如：true */
    certificated: boolean
    /** 标签图标URL，例如：null */
    tagIconUrl: any
    /** 头像贴纸URL，例如：null */
    avatarStickerUrl: string
  }
  /** 公司品牌信息 */
  brandComInfo: {
    /** 加密后的品牌ID，例如：'ghi789jkl012...' */
    encryptBrandId: string
    /** 公司名称，例如：'北京科技有限公司' */
    brandName: string
    /** 公司Logo URL，例如：'https://img.bosszhipin.com/beijin/icon/logo.png' */
    logo: string
    /** 公司阶段编码，例如：0 */
    stage: number
    /** 公司阶段名称，例如：'' */
    stageName: string
    /** 公司规模编码，例如：301 */
    scale: number
    /** 公司规模描述，例如：'50-150人' */
    scaleName: string
    /** 行业编码，例如：100020 */
    industry: number
    /** 行业名称，例如：'互联网' */
    industryName: string
    /** 公司介绍，例如：'' */
    introduce: string
    /** 公司标签，例如：[] */
    labels: Array<any>
    /** 活跃时间戳，例如：1640995200000 */
    activeTime: number
    /** 是否显示品牌信息，例如：true */
    visibleBrandInfo: boolean
    /** 是否关注品牌，例如：false */
    focusBrand: boolean
    /** 客户品牌名称，例如：'北京科技有限公司' */
    customerBrandName: string
    /** 客户品牌阶段名称，例如：'' */
    customerBrandStageName: string
  }
  /** 一键投递简历信息 */
  oneKeyResumeInfo: {
    /** 邀请类型，例如：0 */
    inviteType: number
    /** 是否已发送，例如：false */
    alreadySend: boolean
    /** 是否可以发送简历，例如：false */
    canSendResume: boolean
    /** 是否可以发送电话，例如：false */
    canSendPhone: boolean
    /** 是否可以发送微信，例如：false */
    canSendWechat: boolean
  }
  /** 关系信息 */
  relationInfo: {
    /** 是否对职位感兴趣，例如：false */
    interestJob: boolean
    /** 是否已加为好友，例如：false */
    beFriend: boolean
  }
  /** 残障信息，例如：null */
  handicappedInfo: any
  /** 附录信息 */
  appendixInfo: {
    /** 是否可以反馈，例如：false */
    canFeedback: boolean
    /** 聊天气泡，例如：null */
    chatBubble: any
  }
  /** ATS在线申请信息 */
  atsOnlineApplyInfo: {
    /** 邀请类型，例如：0 */
    inviteType: number
    /** 是否已申请，例如：false */
    alreadyApply: boolean
  }
  /** 认证材料列表，例如：[] */
  certMaterials: Array<any>
}
