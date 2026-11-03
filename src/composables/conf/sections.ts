import { computed } from 'vue'

import type { AlertItem, ConfigAccordionItem } from '@/composables/useHelper/type'

import { useConf } from './index'

export function useConfigSections() {
  const conf = useConf()
  return computed<[AlertItem[], (ConfigAccordionItem | false)[]]>(() => {
    return [
      [
        {
          type: 'alert',
          id: 'config-alert-1',
          showIcon: true,
          title: '悬浮或聚焦配置项即可查看帮助',
          color: 'success',
          description:
            '配置说明自动显示在右侧帮助栏，小屏幕显示在顶部。获取岗位滚动至约 150 条会自动停止，刷新页面或修改求职期望后可重新获取。',
        },
      ],
      [
        {
          label: '筛选配置',
          value: 'filter',
          items: [
            {
              type: 'alert',
              id: 'filter-config-alert-enable',
              title: '复选框打钩才会启用，别忘记打钩启用哦。保存也别忘了',
              description: '排除和包含可点击切换，混合模式适用性过低难以配置不会考虑开发',
              color: 'success',
              showIcon: true,
            },
            {
              type: 'div',
              class: 'grid grid-cols-2 gap-2 mt-2 w-full',
              items: [
                {
                  type: 'select',
                  key: 'company',
                  label: '公司名',
                  help: '不区分大小写,自动移除空格. 公司名排除或包含在集合中，可用于只投或不投某个公司/子公司',
                },
                {
                  type: 'select',
                  key: 'jobTitle',
                  label: '岗位名',
                  help: '不区分大小写,自动移除空格. 岗位名排除或包含在集合中，可用于只投或不投某个岗位名',
                },
                {
                  type: 'select',
                  key: 'jobContent',
                  label: '工作内容',
                  help: "不区分大小写,自动移除空格. 会自动检测上文(不是,不,无需),下文(系统,工具),例子：[外包,上门,销售,驾照], 排除: '外包岗位', 不排除: '不是外包'|'销售系统'",
                },
                {
                  type: 'select',
                  key: 'hrPosition',
                  label: 'Hr职位',
                  help: '不区分大小写,自动移除空格. Hr职位一定包含/排除在集合中，精确匹配, 不在内置中可手动输入,能实现只向经理等进行投递，毕竟人事干的不一定是人事',
                },
                conf.configLevel.intermediate && {
                  type: 'select',
                  key: 'jobAddress',
                  label: '工作地址',
                  help: '不区分大小写,自动移除空格, 即投递工作地址当中必须包含当前内容中的任意一项',
                },
                {
                  type: 'div',
                },
              ],
            },
            {
              type: 'div',
              class: 'flex gap-2 mt-3',
              items: [
                conf.configLevel.intermediate && {
                  type: 'salaryRange',
                  key: 'salaryRange',
                },
                conf.configLevel.intermediate && {
                  type: 'companySizeRange',
                  key: 'companySizeRange',
                },
              ],
            },
            {
              type: 'div',
              class: 'col-span-full flex flex-wrap gap-2 mt-3',
              items: [
                conf.configLevel.intermediate && {
                  type: 'checkbox',
                  key: 'activityFilter',
                  label: '活跃度过滤',
                  help: '打开后会自动过滤掉最近未活跃的Boss发布的工作。以免浪费每天的100次机会。',
                },
                {
                  type: 'checkbox',
                  key: 'goldHunterFilter',
                  label: '猎头过滤',
                  help: 'Boss中有一些猎头发布的工作，但是一般而言这种工作不太行，点击可以过滤猎头发布的职位',
                },
                {
                  type: 'checkbox',
                  key: 'friendStatus',
                  label: '好友过滤(已聊)',
                  help: '判断和hr是否建立过聊天，理论上能过滤的同hr，但是不同岗位的工作',
                },
                conf.configLevel.advanced && {
                  type: 'checkbox',
                  key: 'bossGoldMedalHr',
                  label: '过滤金牌面试官',
                  help: '通过头像框来判断是否是金牌面试官, 据小红书经验 金牌面试官多数是刷kpi,并不靠谱',
                },
                {
                  type: 'checkbox-expire',
                  key: 'useCache',
                  label: '岗位结果缓存',
                  help: '启用缓存后，按岗位缓存过滤未通过和投递成功的结果，避免重复处理同一岗位。默认关闭，启用后默认缓存7天；点击时钟可选择不限、7天、30天等过期时间。修改筛选条件后，如需重新处理岗位，可禁用缓存。',
                },
                conf.configLevel.intermediate && {
                  type: 'checkbox-expire',
                  key: 'sameCompanyFilter',
                  label: '相同公司过滤',
                  help: '投递过的公司id存储到浏览器本地，避免多次向同公司投递，即使岗位不同hr不同',
                },
                conf.configLevel.intermediate && {
                  type: 'checkbox-expire',
                  key: 'sameHrFilter',
                  label: '相同Hr过滤',
                  help: '投递过的hr存储到浏览器本地，避免多次向同hr投递。',
                },
              ],
            },
          ],
        },
        conf.configLevel.intermediate && {
          label: '招呼语配置',
          value: 'greetings',
          items: [
            {
              type: 'alert',
              id: 'config-alert-2',
              showIcon: true,
              color: 'success',
              description: '使用自定义招呼语前 推荐禁用boss直聘自带招呼语',
              actions: [
                {
                  label: '前往',
                  color: 'neutral',
                  variant: 'subtle',
                  onClick: () => {
                    window.open(
                      'https://www.zhipin.com/web/geek/notify-set?type=greetSet',
                      '_blank',
                    )
                  },
                },
              ],
            },
            { type: 'customGreeting', key: 'customGreeting' },
          ],
        },

        conf.configLevel.advanced && {
          label: '地址配置',
          value: 'address',
          items: [{ type: 'address', key: 'address' }],
        },
        conf.configLevel.intermediate && {
          label: '延迟配置',
          value: 'delay',
          items: [
            {
              type: 'div',
              class: 'grid grid-cols-2 gap-3',
              items: [
                {
                  type: 'inputNumber',
                  key: 'delayDeliveryStarts',
                  fieldProps: {
                    label: '投递开始',
                    'data-help': '点击投递按钮会等待一段时间,默认值10s',
                  },
                  inputNumberProps: {
                    min: 1,
                    max: 99999,
                  },
                },
                {
                  type: 'inputNumber',
                  key: 'delayDeliveryInterval',
                  fieldProps: {
                    label: '投递间隔',
                    'data-help': '每个投递的间隔,太快易风控,默认值2s',
                  },
                  inputNumberProps: {
                    min: 1,
                    max: 99999,
                  },
                },
                {
                  type: 'inputNumber',
                  key: 'delayDeliveryPageNext',
                  fieldProps: {
                    label: '投递翻页',
                    'data-help': '投递完下一页之后等待的间隔,太快易风控,默认值60s',
                  },
                  inputNumberProps: {
                    min: 1,
                    max: 99999,
                  },
                },
              ],
            },
          ],
        },
      ],
    ]
  })
}
