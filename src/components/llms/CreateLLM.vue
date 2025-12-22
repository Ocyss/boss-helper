<script lang="ts" setup>
import type { modelData } from '@/composables/useModel'
import type { llm } from '@/composables/useModel/type'
import { reactiveComputed } from '@vueuse/core'
import {
  ElButton,
  ElColorPicker,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElScrollbar,
} from 'element-plus'
import { computed, ref } from 'vue'
import { llms, useModel } from '@/composables/useModel'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'
import LLMForm from './LLMForm.vue'

const props = defineProps<{
  model?: modelData
}>()
const emit = defineEmits<{ (e: 'create', data: modelData): void }>()
function color16() {
  const r = Math.floor(Math.random() * 256)
  const g = Math.floor(Math.random() * 256)
  const b = Math.floor(Math.random() * 256)
  const color = `#${r.toString(16)}${g.toString(16)}${b.toString(16)}`
  return color
}
const show = defineModel<boolean>({ required: true })
const createName = ref(props.model?.name || '')
const createColor = ref(props.model?.color || color16())
const testShow = ref(false)
const { getModel } = useModel()

const _llmsOptions = computed(() =>
  llms.map((v) => {
    const m = v.mode
    return { ...m, value: m.mode }
  }),
)

const selectLLM = ref(props.model?.data?.mode || llms[0].mode.mode)
const formLLM = computed(() =>
  Math.max(
    llms.findIndex(l => l.mode.mode === selectLLM.value),
    0,
  ),
)

type r = Record<string, any>

function dfs(res: r, data: r) {
  for (const key in data) {
    const v = data[key]
    if ('mode' in v) {
      continue
    }
    else if ('alert' in v) {
      res[key] = {}
      dfs(res[key], v.value)
    }
    else {
      res[key] = v.value
    }
  }
}

const llmFormData = reactiveComputed<r>(() => {
  const res = {}
  dfs(res, llms[formLLM.value])
  deepmerge(res, props.model?.data, { clone: false })
  return res
})

function _updateFormLLM(_v: string) {
  // for (const key in llmFormData) {
  //   delete llmFormData[key];
  // }
  dfs(llmFormData, llms[formLLM.value])
  deepmerge(llmFormData, props.model?.data, { clone: false })
}
const testIn = ref('')
const testOut = ref('')
const testExample = {
  Json: [
    `我现在失业了,想找一个新工作,但岗位需求良莠不齐,我需要你对下面的岗位进行评分,我想要双休的,最好可以早九晚五,8小时的.不需要外出,不需要和客户聊天,不需要推销,最后给我Json格式的zifui
\`\`\` 岗位信息
周末双休，早十晚七，带薪年假至少半个月，法定节假日正常放假，购买社保，带薪培训。
网络销售!网络销售!不要再问我是不是纯电销啦!也不是贷款!!!公司的小伙伴很友好，面试结果当天就通知!没有kpi!放心咨询!
职位详情
1.通过公司提供的精准数据进行网络跟进和维护客户2，及时解答客户的相关问题，完成相关销售工作
工作时间:10:00-19:00午休12:00-13:30，固定周末双休，节假日全部正常休假
不需要外出，公司提供精准数据，公平起步，新老人提成一样，氛围好，好晋升
薪资待遇:
熟手无责底薪(4000-6000)起+销售提成+各种奖金，开单奖，综合薪资12-20k，缴纳社保，节日福利
新人最低无责底薪4000，没有业绩考核，有业绩的按照阶梯底薪从4000到6000不等，提成和老员工一样的提成点位没有业绩考核，底薪一直都是无责的，试用期也不会打折!
任职要求:
1.学历不限，18-35岁，男女不限
2.沟通表达能力好，抗压性强，性格外向，逻辑思维能力，复盘总结，有上进心
晋升空间:专员-组长--经理-总监 提供晋升机会
\`\`\`
输出符合下面定义的Json格式字符串
interface aiFiltering {
  rating: number; // 分数, 低于40的我会筛选掉
  negative: string[] | string; // 扣分项
  positive: string[] | string; // 加分项
}
`,
    `你叫做“妙妙”，是一款叫做“妙语笔记”的智能助手，接下来你会分析下面用户的输入：
"""
我的称呼是吴楷鹏，可以叫我大帅哥，出生于香港回归的那一年，生日是 3 月 13 号，喜欢上班
"""
设定：
1. 现在是 2025.10.01 21:21，时区是 Asia/Shanghai
2. 提取昵称、性别、出生日期，剩余全部信息整理成个人介绍
3. 要求输出结构化 JSON 对象，符合下面 TypeScript：
interface UserInfo {
  nickname?: string;
  gender?: 'male'  | 'female';
  dataOfBirth?: string;
  bio?: string;
}
4. 这是例子：const userInfo = {
    "nickname":"董小姐",
    "gender": "female",
    "dateOfBirth":"2001-03-07",
    "bio": "家住在长沙，喜欢做饭"
}

接下来开始分析：const userInfo=`,
  ],
  弱智: [
    '请问你怎么看待鲁迅打周树人呢?',
    '小于90度的是锐角，等于90度的是直角，大于90度的是钝角\n开水有100度，所以开水是钝角吗？',
  ],
}
async function test() {
  const data: modelData = JSON.parse(
    JSON.stringify(props.model || { name: '', key: '' }),
  )
  data.name = createName.value
  data.data = jsonClone(llmFormData) as modelData['data'] & {}
  data.data.mode = selectLLM.value
  logger.debug(data)

  const gpt = getModel(data, testIn.value) as llm<any>
  testOut.value = ''
  try {
    logger.group('LLMTest')
    const msg = await gpt.message({
      data: {},
      test: true,
      onStream: (d: string) => {
        logger.debug('TestResStream', d)
        testOut.value += d
      },
    }, 'aiFiltering')
    if (msg.reasoning_content) {
      testOut.value = `思考过程: ${msg.reasoning_content}\n\n${msg.content}`
    }
    else {
      testOut.value = msg.content || ''
    }
    logger.debug('TestRes', msg)
  }
  catch (err: any) {
    ElMessage.error(err.message)
  }
  logger.groupEnd()
}

function create() {
  const data: modelData = props.model || { name: '', key: '' }
  data.name = createName.value
  data.data = jsonClone(llmFormData) as modelData['data'] & {}
  data.data.mode = selectLLM.value
  data.color = createColor.value
  emit('create', data)
}
</script>

<template>
  <ElDialog
    v-model="show"
    title="创建AI模型"
    width="70%"
    align-center
    destroy-on-close
    draggable
    :z-index="20"
  >
    <ElScrollbar height="60vh" style="padding: 20px">
      <div
        style="
          display: flex;
          align-items: center;
          justify-content: space-between;
        "
      >
        <ElFormItem label="名称:" style="width: 70%">
          <ElInput v-model="createName" />
        </ElFormItem>
        <ElFormItem label="背景:">
          <ElColorPicker v-model="createColor" />
        </ElFormItem>
      </div>

      <!-- <ElSegmented
        v-model="selectLLM"
        :options="llmsOptions"
        block
        @update:model-value="updateFormLLM"
      >
        <template #default="{ item }">
          <div v-if="typeof item === 'object'" class="llms-select">
            <ElIcon size="20" v-html="item.icon" />
            <div>{{ item.label || item.mode }}</div>
          </div>
        </template>
      </ElSegmented> -->
      <ElForm label-width="auto" size="large" label-position="left">
        <LLMForm :key="formLLM" v-model="llmFormData" :data="llms[formLLM]" />
      </ElForm>
    </ElScrollbar>
    <template #footer>
      <div>
        <ElButton @click="show = false">
          取消
        </ElButton>
        <ElButton type="info" @click="testShow = true">
          测试
        </ElButton>
        <ElButton type="primary" @click="create">
          保存
        </ElButton>
      </div>
    </template>
  </ElDialog>
  <ElDialog
    v-model="testShow"
    title="模型测试"
    width="50%"
    align-center
    draggable
    :z-index="21"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
    :modal="false"
  >
    <div class="test-box">
      <div class="mb-4">
        <template v-for="(example, key) in testExample" :key="key">
          <ElButton
            v-for="(item, index) in example"
            :key="key + index"
            type="info"
            plain
            @click="testIn = item"
          >
            {{ key }}
            {{ index + 1 }}
          </ElButton>
        </template>
      </div>
      <ElInput
        v-model="testIn"
        :rows="4"
        type="textarea"
        placeholder="输入提示词"
      />
      <ElInput
        :model-value="testOut"
        :rows="9"
        type="textarea"
        placeholder="GPT响应"
      />
    </div>
    <template #footer>
      <div>
        <ElButton @click="testShow = false">
          返回
        </ElButton>
        <ElButton type="primary" @click="test">
          请求
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style>
.llms-select {
  display: flex;
  align-items: center;
  flex-direction: column;
  grid-gap: 0.5rem;
  gap: 0.5rem;
  padding: 0.5rem;
}
.test-box {
  > div {
    margin-bottom: 20px;
  }
}
</style>
