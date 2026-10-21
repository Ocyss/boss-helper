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
                },
                {
                  type: 'select',
                  key: 'jobTitle',
                },
                {
                  type: 'select',
                  key: 'jobContent',
                },
                {
                  type: 'select',
                  key: 'hrPosition',
                },
                conf.configLevel.intermediate && {
                  type: 'select',
                  key: 'jobAddress',
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
                },
                {
                  type: 'checkbox',
                  key: 'goldHunterFilter',
                },
                {
                  type: 'checkbox',
                  key: 'friendStatus',
                },
                {
                  type: 'checkbox',
                  key: 'bossGoldMedalHr',
                },
                conf.configLevel.intermediate && {
                  type: 'checkbox-expire',
                  key: 'sameCompanyFilter',
                },
                conf.configLevel.intermediate && {
                  type: 'checkbox-expire',
                  key: 'sameHrFilter',
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
                {
                  type: 'inputNumber',
                  key: 'delayMessageSending',
                  fieldProps: {
                    label: '消息发送',
                    'data-help': '在发送消息前允许等待一定的时间让用户来修改或手动发送,默认值2s',
                  },
                  inputNumberProps: {
                    min: 1,
                    max: 99999,
                    disable: true,
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
