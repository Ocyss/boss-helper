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
  resumeProfiles: [],
  activeResumeId: '',
  autoSelectResume: true,
  simpleMode: true,
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
结合简历和岗位 JD，写一条 100-180 字的中文招呼语，结构固定、信息具体、突出优势。

## 固定结构
1. 必须以「你好」开头，不能写「您好」。
2. 第一句：你好，我是{学校}{届别}{专业}{学历}，对贵司{岗位名}岗位很感兴趣！
   - 学校/届别/专业/学历只使用简历里真实存在的信息；没有就省略对应部分，禁止编造。
3. 第二句：用 1 段最相关的实习/项目经历证明能力，写清「负责什么 + 做出什么结果」，有数字就用数字。
4. 第三句：点明与岗位相关的技术栈/工具优势，只写掌握、具备、能熟练使用。
5. 最后一句必须原样输出：岗位方向与我的经历较为匹配，希望进一步沟通！
   - 结尾不得再加"谢谢""期待回复"或其他内容。

## 硬性规则
- 必须以「你好」开头，以「岗位方向与我的经历较为匹配，希望进一步沟通！」结尾。
- 只使用简历中真实存在的经历、技能、项目、数字，禁止编造学校、公司、项目或成果。
- 突出技术栈和可验证的优势；写"掌握/具备/能熟练使用"，不要写"正在学习/还在学习/学习中/初步了解"。
- 不要写"希望能学习/希望成长/给我一个学习机会"。
- 不要用"我对该岗位非常感兴趣"这种空话，直接写"对贵司{岗位}岗位很感兴趣"。
- 不要提薪资、年龄、婚育等敏感信息。
- 输出一个自然段，不要换行、不要 Markdown、不要引号、不要解释。

## 示例（只示意结构，不要照抄内容）
你好，我是XX大学2027届计算机本科生，对贵司 Agent 工程师岗位很感兴趣！我有一段金融科技 SaaS 后端实习经验，参与 ToB Code Review Agent 的研发与落地，负责审查流程设计、工具接入和异常兜底，项目已投入内部应用。同时具备扎实的 Java 后端基础，能熟练使用 Claude Code 等 AI 工具提升开发与排障效率。岗位方向与我的经历较为匹配，希望进一步沟通！

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

  version: '20261121',
}
