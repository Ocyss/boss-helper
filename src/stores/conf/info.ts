import type { FormData, FormInfoData } from '@/types/formData'

export const formInfoData: FormInfoData = {
  company: {
    'label': '公司名',
    'data-help': '公司名排除或包含在集合中，模糊匹配，可用于只投或不投某个公司/子公司。',
  },
  jobTitle: {
    'label': '岗位名',
    'data-help': '岗位名排除或包含在集合中，模糊匹配，可用于只投或不投某个岗位名。',
  },
  jobContent: {
    'label': '工作内容',
    'data-help': '会自动检测上文(不是,不,无需),下文(系统,工具),例子：[外包,上门,销售,驾照], 排除: \'外包岗位\', 不排除: \'不是外包\'|\'销售系统\'',
  },
  hrPosition: {
    'label': 'Hr职位',
    'data-help': 'Hr职位一定包含/排除在集合中，精确匹配, 不在内置中可手动输入,能实现只向经理等进行投递，毕竟人事干的不一定是人事',
  },
  jobAddress: {
    'label': '工作地址',
    'data-help': '只能为包含模式, 即投递工作地址当中必须包含当前内容中的任意一项，否则排除',
  },
  salaryRange: {
    'label': '薪资范围',
    'data-help': '投递工作的薪资范围, 更多选项可看高级配置',
  },
  companySizeRange: {
    'label': '公司规模范围',
    'data-help': '投递工作的公司规模, 推荐使用boss自带选项进行筛选。严格宽松定义在薪资高级配置中有写',
  },
  customGreeting: {
    'label': '自定义招呼语',
    'data-help': '因为boss不支持将自定义的招呼语设置为默认招呼语。开启表示发送boss默认的招呼语后还会发送自定义招呼语',
  },
  greetingVariable: {
    'label': '招呼语变量',
    'data-help': '使用mitem模板引擎来对招呼语进行渲染;',
  },
  activityFilter: {
    'label': '活跃度过滤',
    'data-help': '打开后会自动过滤掉最近未活跃的Boss发布的工作。以免浪费每天的100次机会。',
  },
  goldHunterFilter: {
    'label': '猎头过滤',
    'data-help': 'Boss中有一些猎头发布的工作，但是一般而言这种工作不太行，点击可以过滤猎头发布的职位',
  },
  friendStatus: {
    'label': '好友过滤(已聊)',
    'data-help': '判断和hr是否建立过聊天，理论上能过滤的同hr，但是不同岗位的工作',
  },
  sameCompanyFilter: {
    'label': '相同公司过滤',
    'data-help': '投递过的公司id存储到浏览器本地，避免多次向同公司投递，即使岗位不同hr不同',
  },
  sameHrFilter: {
    'label': '相同Hr过滤',
    'data-help': '投递过的hr存储到浏览器本地，避免多次向同hr投递。',
  },
  notification: {
    'label': '发送通知',
    'data-help': '可以在网站管理中打开通知权限,当停止时会自动发送桌面端通知提醒。',
  },
  useCache: {
    'label': '启用缓存',
    'data-help': '开启后会缓存投递记录，避免重复投递，提高效率。但是缓存功能并不积极维护。可能会有bug，或者意外情况，如遇到可尝试清空缓存或者禁用',
  },
  deliveryLimit: {
    'label': '投递上限',
    'data-help': '达到上限后会自动暂停，默认100次',
  },
  aiGreeting: {
    'label': 'AI招呼语',
    'data-help': '即使前面招呼语开了也不会发送，只会发送AI生成的招呼语，让gpt来打招呼真是太棒了，毕竟开场白很重要。',
    'example': [
      `我现在需要求职，所以请你来写求职招呼语来向boss或hr打招呼，你需要代入我的身份也就是一名求职者.
  ## 我的简历:
  \`\`\`
  
  \`\`\`
  ## 待处理的岗位信息:
  <岗位信息>
  岗位名:{{ card.jobName }}   薪资: {{ card.salaryDesc }}
  学历要求: {{ card.degreeName }}
  技能要求: {{ data.skills }}
  岗位标签:{{ card.jobLabels }}
    <岗位描述>
    {{ card.postDescription }}
    <岗位描述/>
  </岗位信息>
  `,
      [
        {
          role: 'system',
          content: `## 角色
  求职小能手
  
  ## input：
  1 **求职者信息**
  \`\`\`
  1. ....
  2. ....
  3. ....
  \`\`\`
  
  ## outputformat
  招呼语字符串，无书信格式和前缀，和聊天开场白一样的介绍求职者`,
        },
        {
          role: 'user',
          content: `### 待处理的岗位信息:\`\`\`
  <岗位信息>
  岗位名:{{ card.jobName }}   薪资: {{ card.salaryDesc }}
  学历要求: {{ card.degreeName }}
  技能要求: {{ data.skills }}
  岗位标签:{{ card.jobLabels }}
    <岗位描述>
    {{ card.postDescription }}
    <岗位描述/>
  </岗位信息>
  \`\`\``,
        },
      ],
    ],
  },
  aiFiltering: {
    'label': 'AI过滤',
    'data-help': '根据工作内容让gpt分析过滤，真是太稳健了，不放过任何一个垃圾',
    'example': [
      `我现在需要求职，让你根据我的需要对岗位进行评分，方便我筛选岗位。
  ## 要求:
  - 加分: 双休,早九晚五,新技术,机会多,年轻人多 每个加分项 10分
  - 扣分: 需要上门,福利少,需要和客户交流,需要推销 每个扣分项 10分
  
  ## 待处理的岗位信息:
  <岗位信息>
  岗位名:{{ card.jobName }}   薪资: {{ card.salaryDesc }}
  学历要求: {{ card.degreeName }}    工作经验要求: {{ card.experienceName }}
  福利列表: {{ data.welfareList }}
  技能要求: {{ data.skills }}
  岗位标签:{{ card.jobLabels }}
    <岗位描述>
    {{ card.postDescription }}
    <岗位描述/>
  </岗位信息>
  
  ## 输出
  
  总是输出以下Json格式
  
  interface aiFilteringItem {
    reason: string; // 扣分或加分的理由
    score: number ; // 分数变化 正整数 不需要+-正负符号
  }
  
  interface aiFiltering {
    negative: aiFilteringItem[]; // 扣分项
    positive: aiFilteringItem[] ; // 加分项
  }
  
  总分低于10分将过滤掉`,
      [
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
  岗位名:{{ card.jobName }}   薪资: {{ card.salaryDesc }}
  学历要求: {{ card.degreeName }}    工作经验要求: {{ card.experienceName }}
  福利列表: {{ data.welfareList }}
  技能要求: {{ data.skills }}
  岗位标签:{{ card.jobLabels }}
    <岗位描述>
    {{ card.postDescription }}
    <岗位描述/>
  </岗位信息>`,
        },
      ],
    ],
  },
  aiReply: {
    'label': 'AI回复',
    'data-help': '万一消息太多，回不过来了呢，也许能和AiHR聊到地球爆炸？魔法击败魔法',
  },
  record: {
    'label': '内容记录',
    'data-help': '拿这些数据去训练个Ai岂不是美滋滋咯？',
  },
  delay: {
    deliveryStarts: {
      'label': '投递开始',
      'data-help': '点击投递按钮会等待一段时间,默认值10s',
    },
    deliveryInterval: {
      'label': '投递间隔',
      'data-help': '每个投递的间隔,太快易风控,默认值2s',
    },
    deliveryPageNext: {
      'label': '投递翻页',
      'data-help': '投递完下一页之后等待的间隔,太快易风控,默认值60s',
    },
    messageSending: {
      'label': '消息发送',
      'data-help': '暂未实现 ,在发送消息前允许等待一定的时间让用户来修改或手动发送,默认值5s',
      'disable': true,
    },
  },
  amap: {
    enable: {
      'label': '启用',
      'data-help': '启用高德地图, 用于获取工作地址的距离和时间进行筛选，需要配置自己的key',
    },
    key: {
      'label': '高德地图key',
      'data-help': '高德地图key, 需要自己申请',
    },
    origins: {
      'label': '起点经纬度',
      'data-help': '起点经纬度, 经度和纬度用","分隔, 可以输入完整地址点击按钮自动获取',
    },
    straightDistance: {
      'label': '直线距离',
      'data-help': '直线距离, 为0禁用，单位: km',
    },
    drivingDistance: {
      'label': '驾车距离',
      'data-help': '驾车距离, 为0禁用，会考虑当前时间的路况，不同时间结果不一样，策略为"速度优先", 单位: km',
    },
    drivingDuration: {
      'label': '驾车时间',
      'data-help': '驾车时间, 为0禁用，会考虑当前时间的路况，不同时间结果不一样，策略为"速度优先", 单位: 分钟',
    },
    walkingDistance: {
      'label': '步行距离',
      'data-help': '步行距离, 为0禁用，单位: km',
    },
    walkingDuration: {
      'label': '步行时间',
      'data-help': '步行时间, 为0禁用，单位: 分钟',
    },
  },
}

export const defaultFormData: FormData = {
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
    value: 100,
  },
  greetingVariable: {
    value: true,
  },
  activityFilter: {
    value: true,
  },
  friendStatus: {
    value: true,
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
    prompt: '',
  },
  aiFiltering: {
    enable: false,
    prompt: '',
    score: 10,
  },
  aiReply: {
    enable: false,
    prompt: '',
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
  delay: {
    deliveryStarts: 3,
    deliveryInterval: 2,
    deliveryPageNext: 60,
    messageSending: 5,
  },
  version: '20240401',
}
