import type { FormData } from '@/types/formData'

// TODO: 移除info, 忘记当初为啥要维护这一坨了, 还是直接写组件里面好看

export const formInfoData: Record<string, any> = {
  configLevel: {
    options: [
      {
        value: 'beginner',
        label: '新手',
      },
      {
        value: 'intermediate',
        label: '初学者',
      },
      {
        value: 'advanced',
        label: '中级',
      },
      {
        value: 'expert',
        label: '高级',
      },
    ],
    'data-help': '为不同人群展示不同的配置项, 减少上手难度跟配置过多而产生的恐惧',
  },
  company: {
    label: '公司名',
    'data-help': '公司名排除或包含在集合中，模糊匹配，可用于只投或不投某个公司/子公司。',
  },
  jobTitle: {
    label: '岗位名',
    'data-help': '岗位名排除或包含在集合中，模糊匹配，可用于只投或不投某个岗位名。',
  },
  jobContent: {
    label: '工作内容',
    'data-help':
      "会自动检测上文(不是,不,无需),下文(系统,工具),例子：[外包,上门,销售,驾照], 排除: '外包岗位', 不排除: '不是外包'|'销售系统'",
  },
  hrPosition: {
    label: 'Hr职位',
    'data-help':
      'Hr职位一定包含/排除在集合中，精确匹配, 不在内置中可手动输入,能实现只向经理等进行投递，毕竟人事干的不一定是人事',
  },
  jobAddress: {
    label: '工作地址',
    'data-help': '只能为包含模式, 即投递工作地址当中必须包含当前内容中的任意一项，否则排除',
  },
  customGreeting: {
    label: '自定义招呼语',
    'data-help':
      '因为boss不支持将自定义的招呼语设置为默认招呼语。开启表示发送boss默认的招呼语后还会发送自定义招呼语',
  },
  autoDelivery: {
    label: '自动投递（含招呼语）',
    'data-help':
      '高风险开关，默认关闭；开启后筛选通过的岗位会真实投递，并通过 BOSS 聊天通道自动发送合规招呼语。关闭时只停在待人工确认。',
  },
  greetingVariable: {
    label: '招呼语变量',
    'data-help': '使用mitem模板引擎来对招呼语进行渲染;',
  },
  activityFilter: {
    label: '活跃度过滤',
    'data-help': '打开后会自动过滤掉最近未活跃的Boss发布的工作。以免浪费每天的100次机会。',
  },
  goldHunterFilter: {
    label: '猎头过滤',
    'data-help':
      'Boss中有一些猎头发布的工作，但是一般而言这种工作不太行，点击可以过滤猎头发布的职位',
  },
  friendStatus: {
    label: '好友过滤(已聊)',
    'data-help': '判断和hr是否建立过聊天，理论上能过滤的同hr，但是不同岗位的工作',
  },
  bossGoldMedalHr: {
    label: '过滤金牌面试官',
    'data-help': '通过头像框来判断是否是金牌面试官, 据小红书经验 金牌面试官多数是刷kpi,并不靠谱',
  },
  sameCompanyFilter: {
    label: '相同公司过滤',
    'data-help': '投递过的公司id存储到浏览器本地，避免多次向同公司投递，即使岗位不同hr不同',
  },
  sameHrFilter: {
    label: '相同Hr过滤',
    'data-help': '投递过的hr存储到浏览器本地，避免多次向同hr投递。',
  },
  aiGreeting: {
    label: 'AI招呼语',
    'data-help':
      '只有开启“自动投递（含招呼语）”后才会自动发送合规 AI 招呼语；否则不会进入真实投递流程。',
  },
  aiFiltering: {
    label: 'AI过滤',
    'data-help': '根据工作内容让gpt分析过滤，真是太稳健了，不放过任何一个垃圾',
  },
  aiReply: {
    label: 'AI回复',
    'data-help': '万一消息太多，回不过来了呢. 功能暂未实现',
  },
  record: {
    label: '内容记录',
    'data-help': '拿这些数据去训练个Ai岂不是美滋滋咯？',
  },
  amap: {
    enable: {
      label: '启用',
      'data-help': '启用高德地图, 用于获取工作地址的距离和时间进行筛选，需要配置自己的key',
    },
    key: {
      label: '高德地图key',
      'data-help': '高德地图key, 需要自己申请',
    },
    origins: {
      label: '起点经纬度',
      'data-help': '起点经纬度, 经度和纬度用","分隔, 可以输入完整地址点击按钮自动获取',
    },
    straightDistance: {
      label: '直线距离',
      'data-help': '直线距离, 为0禁用，单位: km',
    },
    drivingDistance: {
      label: '驾车距离',
      'data-help':
        '驾车距离, 为0禁用，会考虑当前时间的路况，不同时间结果不一样，策略为"速度优先", 单位: km',
    },
    drivingDuration: {
      label: '驾车时间',
      'data-help':
        '驾车时间, 为0禁用，会考虑当前时间的路况，不同时间结果不一样，策略为"速度优先", 单位: 分钟',
    },
    walkingDistance: {
      label: '步行距离',
      'data-help': '步行距离, 为0禁用，单位: km',
    },
    walkingDuration: {
      label: '步行时间',
      'data-help': '步行时间, 为0禁用，单位: 分钟',
    },
  },
}

export const defaultFormData: FormData = {
  configLevel: 'beginner',
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
  autoDelivery: {
    // 默认关闭，避免导入旧配置后意外触发真实投递或消息发送。
    value: false,
  },
  deliveryLimit: {
    value: 120,
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
  },
  sameHrFilter: {
    value: true,
  },
  goldHunterFilter: {
    value: false,
  },
  notification: {
    value: true,
  },
  useCache: {
    value: false,
  },
  aiGreeting: {
    enable: false,
    prompt: [
      {
        role: 'system',
        content: `## 角色
你是 BOSS 直聘求职者的 AI 招呼语助手。

## 求职者信息
{{ candidateProfile }}

## 任务
根据求职者事实画像和岗位信息，生成一条适合 BOSS 直聘首次沟通的中文招呼语。

## 硬性约束
1. 只使用求职者画像中明确出现的事实，不得编造薪资、到岗时间、项目、公司、技术栈、年限或成果。
2. 纯文本，80-130 字，绝对不超过 150 字；最多 3 句话。
3. 不要标题、列表、Markdown、引号、表情、客套开头或落款。
4. 最多引用岗位描述中的 2 个关键词，并至少引用 1 个求职者画像中的量化结果；若画像没有量化事实，不能伪造数字。
5. 结构为：身份/年限/方向 → 一项与岗位匹配的真实经历和结果 → 针对岗位的一个具体问题。
6. 信息不足时输出“需人工判断”，不要输出看似完整但包含猜测的招呼语。

## 输出格式
只输出一条招呼语或“需人工判断”，不要输出 JSON。`,
      },
      {
        role: 'user',
        content: `## 待处理岗位
\`\`\`
  <岗位信息>
  岗位名:{{ jobData.jobName }}   薪资: {{ jobData.salary }}
  学历要求: {{ jobData.degreeName }}
  工作经验: {{ jobData.experienceName }}
  技能要求: {{ jobData.skills }}
  岗位标签: {{ jobData.jobLabels }}
    <岗位描述>
    {{ jobData.jobDescription }}
    <岗位描述/>
  </岗位信息>
\`\`\``,
      },
    ],
  },
  aiFiltering: {
    enable: false,
    prompt: [
      {
        role: 'system',
        content: `## 角色
你是求职岗位筛选评委，必须以证据为依据，不得根据岗位名称猜测。

## 求职者画像
{{ candidateProfile }}

## 评分规则
基础分 60 分。
- 加分项每项 +10：双休、早九晚五、新技术/AI 应用、成长机会、年轻团队、明确技术产出。
- 扣分项每项 -10：上门服务、福利明显缺失、需要频繁客户交流、销售/推销、长期驻场、外包性质。
- 岗位匹配：强匹配 +20，中匹配 +10，弱匹配 0，不匹配 -10。
- 若存在外包、纯销售、长期驻场或明显违背画像的硬性条件，veto=true。
- 每个 positive/negative 必须引用岗位描述中的短证据；没有证据不得添加。

## 输出要求
只返回 JSON，不要 Markdown 或解释文字：
{
  "positive": [{"reason":"带证据的加分理由","score":10}],
  "negative": [{"reason":"带证据的扣分理由","score":10}],
  "finalScore": 0,
  "verdict": "accept" | "review" | "reject",
  "veto": false
}
finalScore 必须是有限数字；无法确认岗位事实、画像事实或证据不足时，verdict="review"、veto=true。`,
      },
      {
        role: 'user',
        content: `## 待处理的岗位信息
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
  delayDeliveryStarts: 3,
  delayDeliveryInterval: 5,
  delayDeliveryPageNext: 60,
  delayMessageSending: 2,
  delayRanges: {
    starts: [3, 3, false],
    interval: [5, 5, false],
    pageNext: [60, 60, false],
    message: [2, 2, false],
  },
  version: '20260718',
}
