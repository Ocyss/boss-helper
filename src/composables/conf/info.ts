import type { FormData } from '@/types/formData'

export const defaultFormData: FormData = {
  configLevel: 'beginner',
  resume: {
    raw: '',
    summary: '',
    skills: '',
    years: '',
    projects: '',
    updatedAt: 0,
  },
  workTime: {
    enable: true,
    start: '09:00',
    end: '18:00',
  },
  company: {
    include: false,
    value: [],
    options: [],
    enable: false,
  },
  jobTitle: {
    include: true,
    value: [],
    options: [],
    enable: false,
  },
  jobContent: {
    include: false,
    value: [],
    options: [],
    enable: false,
  },
  hrPosition: {
    include: true,
    value: [],
    options: ['经理', '主管', '法人', '人力资源主管', 'hr', '招聘专员'],
    enable: false,
  },
  jobAddress: {
    value: [],
    options: [],
    enable: false,
    include: true,
  },
  salaryRange: {
    value: [8, 13, false],
    advancedValue: {
      // 默认全部关闭，避免用户未配置而投递错误岗位
      H: [0, 1, false],
      D: [0, 1, false],
      M: [0, 1, false],
    },
    enable: false,
  },
  companySizeRange: {
    value: [500, 2000, true],
    enable: false,
  },
  customGreeting: {
    value: '',
    enable: false,
  },
  deliveryLimit: {
    value: 30,
  },
  greetingVariable: {
    value: false,
  },
  activityFilter: {
    value: true,
  },
  friendStatus: {
    value: true,
  },
  bossGoldMedalHr: {
    value: false,
  },
  sameCompanyFilter: {
    value: false,
    expire: 0,
  },
  sameHrFilter: {
    value: true,
    expire: 0,
  },
  goldHunterFilter: {
    value: false,
  },
  notification: {
    value: true,
  },
  useCache: {
    value: false,
    expire: 7 * 24 * 60 * 60 * 1000,
  },
  aiGreeting: {
    enable: false,
    prompt: [
      {
        role: 'system',
        content: `## 角色
你是求职者本人，正在 BOSS 直聘上给 HR 发第一条招呼语。

## 目标
结合求职者简历和岗位 JD，写一条 60-100 字的中文开场白，像真人聊天，不像群发模板。

## 规则
- 只使用简历中真实存在的经历、技能和数字，禁止编造。
- 第一句点出与岗位最相关的匹配点；第二句给一个具体证据（项目、数据或成果）；第三句表达进一步沟通意愿。
- 不要用"贵司""我对该岗位非常感兴趣""希望能有机会"等套话。
- 不要提薪资、年龄、婚育等敏感信息。
- 只输出招呼语正文，不要前缀、解释、引号或 Markdown。

## 求职者信息
{{ resume.summary }}
技能：{{ resume.skills }}
年限：{{ resume.years }}
项目：{{ resume.projects }}`,
      },
      {
        role: 'user',
        content: `### 岗位信息
岗位名：{{ jobData.jobName }}
薪资：{{ jobData.salary }}
学历：{{ jobData.degreeName }}
经验：{{ jobData.experienceName }}
技能要求：{{ jobData.skills }}
岗位标签：{{ jobData.jobLabels }}

JD：
{{ jobData.jobDescription }}`,
      },
    ],
  },
  aiFiltering: {
    enable: false,
    prompt: [
      {
        role: 'system',
        content: `## 角色
  求职评委

  最终返回下面格式的JSON字符串,不要有任何其他字符

  interface aiFilteringItem {
    reason: string; // 扣分或加分的理由
    score: number ; // 分数变化 正整数 不需要+-正负符号
  }

  interface aiFiltering {
    negative: aiFilteringItem[]; // 扣分项
    positive: aiFilteringItem[] ; // 加分项
  }

  ## 求职者需求
  - 加分: 双休,早九晚五,新技术,机会多,年轻人多 每个加分项 10分
  - 扣分: 需要上门,福利少,需要和客户交流,需要推销 每个扣分项 10分
  `,
      },
      {
        role: 'user',
        content: `## 待处理的岗位信息:
  <岗位信息>
  岗位名:{{ jobData.jobName }}   薪资: {{ jobData.salary }}
  学历要求: {{ jobData.degreeName }}    工作经验要求: {{ jobData.experienceName }}
  福利列表: {{ jobData.welfareList }}
  技能要求: {{ jobData.skills }}
  岗位标签:{{ jobData.jobLabels }}
    <岗位描述>
    {{ jobData.jobDescription }}
    <岗位描述/>
  </岗位信息>`,
      },
    ],
    score: 10,
  },
  aiMatch: {
    enable: false,
    threshold: 65,
    prompt: [
      {
        role: 'system',
        content: `## 角色
你是求职匹配评估器。

## 任务
根据求职者简历和岗位 JD，判断匹配程度。

## 输出
只输出 JSON，不要 Markdown 或解释：
{"score": 0, "matched": ["匹配点"], "gaps": ["缺口"], "reason": "一句话结论"}

## 评分规则
- score 为 0-100 的整数。
- 硬性要求（核心技能、年限、学历、行业）不满足要显著扣分。
- 简历未写的能力不得视为具备。
- 80 以上很匹配，60-79 可以投，40-59 勉强，40 以下不建议。`,
      },
      {
        role: 'user',
        content: `## 简历
{{ resume.summary }}
技能：{{ resume.skills }}
年限：{{ resume.years }}
项目：{{ resume.projects }}

## 岗位
岗位名：{{ jobData.jobName }}
薪资：{{ jobData.salary }}
学历：{{ jobData.degreeName }}
经验：{{ jobData.experienceName }}
JD：
{{ jobData.jobDescription }}`,
      },
    ],
  },
  aiReply: {
    enable: false,
    prompt: [{ role: 'user', content: '帮我写一个回复的提示' }],
  },
  amap: {
    key: '',
    origins: '',
    straightDistance: 0,
    drivingDistance: 0,
    drivingDuration: 0,
    walkingDistance: 0,
    walkingDuration: 0,
    enable: false,
  },
  record: {
    enable: false,
  },
  delayDeliveryStarts: 10,
  delayDeliveryInterval: 90,
  delayDeliveryPageNext: 120,

  version: '20261120',
}
