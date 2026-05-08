import type { Column } from 'element-plus'
import { ElButton, ElCheckbox, ElCheckboxGroup, ElIcon, ElPopover, ElTag } from 'element-plus'
import { computed, reactive, ref } from 'vue'

import type {
  CompanyNameError,
  CompanySizeError,
  JobDescriptionError,
  JobTitleError,
  PublishError,
  SalaryError,
  UnknownError,
} from '@/types/deliverError'
import type { amapDistance, amapGeocode } from '@/utils/amap'

import type { MyJobListData } from './jobs'

export type logErr =
  | null
  | undefined
  | PublishError
  | JobTitleError
  | CompanyNameError
  | SalaryError
  | CompanySizeError
  | JobDescriptionError
  | UnknownError

export interface logData {
  listData: MyJobListData
  el?: Element
  amap?: {
    geocode?: Awaited<ReturnType<typeof amapGeocode>>
    distance?: Awaited<ReturnType<typeof amapDistance>>
  }
  bossData?: bossZpBossData
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

interface log {
  job?: MyJobListData
  title: string // 标题
  state: logState // 信息,成功,过滤,出错
  state_name: string // 标签文本
  message?: string // 显示消息
  data?: logData
}

type HeaderCellRendererParams = Parameters<NonNullable<Column<log>['headerCellRenderer']>>[0]

const dialogData = reactive<{ show: boolean; data?: log }>({ show: false })

const data = ref<log[]>([])

const stateNames: [logState, string][] = [
  ['info', '消息'],
  ['success', '投递成功'],
  ['warning', '重复沟通'],
  ['warning', '岗位名筛选'],
  ['warning', '公司名筛选'],
  ['warning', '薪资筛选'],
  ['warning', '公司规模筛选'],
  ['warning', '工作内容筛选'],
  ['warning', 'Hr职位筛选'],
  ['warning', 'AI筛选'],
  ['warning', '好友状态'],
  ['warning', '活跃度过滤'],
  ['warning', '猎头过滤'],
  ['danger', '未知错误'],
  ['danger', '投递出错'],
  ['danger', '打招呼出错'],
]

const filterStatus = ref(stateNames.map((item) => item[1]))

const filterData = computed(() => {
  if (filterStatus.value.length !== stateNames.length) {
    return data.value.filter((item) => filterStatus.value.includes(item.state_name))
  }
  return data.value
})

const columns: Column<log>[] = [
  {
    key: 'title',
    title: '标题',
    dataKey: 'title',
    width: 200,
    cellRenderer: ({ rowData }) => (
      <a
        onClick={() => {
          dialogData.show = true
          dialogData.data = rowData
        }}
      >
        {rowData.title}
      </a>
    ),
  },
  {
    key: 'state',
    title: '状态',
    width: 150,
    align: 'center',
    cellRenderer: ({ rowData }) => (
      <ElTag type={rowData.state ?? 'primary'}>{rowData.state_name}</ElTag>
    ),
    headerCellRenderer: (props: HeaderCellRendererParams) => {
      return (
        <div class="flex items-center justify-center">
          <span class="mr-2 text-xs">{props.column.title}</span>
          <ElPopover trigger="click" {...{ width: 200 }}>
            {{
              default: () => (
                <div class="filter-wrapper">
                  <ElCheckboxGroup v-model={filterStatus.value}>
                    {stateNames.map((item) => (
                      <ElCheckbox value={item[1]}>
                        <ElTag type={item[0]}>{item[1]}</ElTag>
                      </ElCheckbox>
                    ))}
                  </ElCheckboxGroup>
                  <div class="el-table-v2__demo-filter">
                    <ElButton
                      text
                      onClick={() => {
                        filterStatus.value = stateNames
                          .map((item) => item[1])
                          .filter((status) => !filterStatus.value.includes(status))
                      }}
                    >
                      反选
                    </ElButton>
                  </div>
                </div>
              ),
              reference: () => (
                <ElIcon class="cursor-pointer">
                  <svg
                    class="icon"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    p-id="2612"
                    width="200"
                    height="200"
                  >
                    <path
                      d="M608.241895 960.010751c-17.717453 0-31.994625-14.277171-31.994625-31.994625l0-479.919368c0-7.912649 2.92424-15.653284 8.256677-21.501764l208.82513-234.455233L230.498908 192.139761l209.169158 234.627247c5.160423 5.84848 8.084663 13.417101 8.084663 21.32975l0 288.811692 50.916177 41.111372c13.761129 11.180917 15.825298 31.306568 4.816395 45.067697s-31.306568 15.825298-45.067697 4.816395L395.632454 776.815723c-7.568621-6.020494-11.868974-15.309256-11.868974-24.942046L383.763481 460.137746 135.203091 181.302873c-8.428691-9.460776-10.492861-22.877877-5.332437-34.402822 5.160423-11.524945 16.685369-18.921552 29.242399-18.921552l706.289938 0c12.729044 0 24.081975 7.396607 29.242399 19.093566 5.160423 11.524945 2.92424 25.11406-5.504452 34.402822L640.236519 460.30976l0 467.706367C640.236519 945.73358 625.959348 960.010751 608.241895 960.010751z"
                      fill="#575B66"
                      p-id="2613"
                    ></path>
                  </svg>
                </ElIcon>
              ),
            }}
          </ElPopover>
        </div>
      )
    },
  },
  {
    key: 'message',
    title: '信息',
    dataKey: 'message',
    width: 360,
    minWidth: 360,
    align: 'left',
  },
]

export function useLog() {
  const add = (job: MyJobListData, err: logErr, logdata?: logData, msg?: string) => {
    const state = !err ? 'success' : err.state
    const message = msg ?? (err ? err.message : undefined)

    data.value.push({
      job,
      title: job.jobName,
      state,
      state_name: err?.name ?? '投递成功',
      message,
      data: logdata,
    })
  }
  const info = (title: string, message: string) => {
    data.value.push({
      title,
      state: 'info',
      state_name: '消息',
      message,
      data: undefined,
    })
  }
  const clear = () => {
    data.value = []
  }

  return {
    columns,
    data,
    filterData,
    clear,
    add,
    info,
    dialogData,
  }
}

window.__q_log = data
