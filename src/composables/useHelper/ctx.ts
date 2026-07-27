import { Toast } from '@nuxt/ui/runtime/composables/useToast.js'
import { extendRef } from '@vueuse/core'
import { Reactive, ref } from 'vue'
import { Ref } from 'vue'

import { useConf } from '@/composables/conf'
import { DeliveryWorkflow } from '@/composables/useApplying'
import type { BossHelperError } from '@/composables/useApplying/deliverError'
import {
  PreflightReport,
  SimulationResult,
  TaskResult,
  WorkflowData,
} from '@/composables/useApplying/type'
import { useModel } from '@/composables/useModel'
import { ChatModel } from '@/composables/useModel'
import { counter } from '@/message'
import { FormDataInput } from '@/types/formData'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

import { initNetConf, NetConf } from './netConf'
import { Log, JobData, LogData, ConfigAccordionItem, AlertItem, LogState } from './type'

const logsKey = 'local:web-geek-job-Logs'
const maxLogs = 1000
let logSequence = 0

export abstract class HelperContext<C extends HelperContext<C, T, S>, T, S> {
  netConf: Ref<NetConf | null>
  netConfTimer: NodeJS.Timeout | null = null
  conf: ReturnType<typeof useConf>
  models: ReturnType<typeof useModel>
  statistics: ReturnType<typeof useStatistics>

  chatModel: ChatModel
  workflow: DeliveryWorkflow<C, T, S> | null = null
  workflowRunning = computed(() => this.workflow?.status.value === 'running')
  preflightRunning: Ref<boolean>
  simulationRunning: Ref<boolean>
  preflightReport: Ref<PreflightReport | null>
  simulationResult: Ref<SimulationResult | null>
  jobResultMaps: Reactive<Map<string, TaskResult>>

  abstract jobList: Ref<JobData[]>
  abstract jobMaps: Map<string, WorkflowData<T, S>>

  currentJob: Ref<string | null>
  _logs: Ref<Log[]>
  private logsInitialized = false
  private logsInitPromise: Promise<void> | null = null
  private logsSaveQueue: Promise<void> = Promise.resolve()
  logs: {
    add: (job: JobData, err?: BossHelperError, logdata?: LogData, msg?: string) => void
    info: (title: string, message: string) => void
    step: (
      job: JobData,
      step: string,
      state: LogState,
      message?: string,
      durationMs?: number,
    ) => void
    init: () => Promise<void>
    clear: () => void
    value: Log[]
  }

  constructor() {
    this.conf = useConf()
    this.models = useModel()
    this.statistics = useStatistics()
    this.preflightRunning = ref(false)
    this.simulationRunning = ref(false)
    this.preflightReport = ref(null)
    this.simulationResult = ref(null)
    this.currentJob = ref(null)
    this._logs = ref([])
    this.logs = extendRef(this._logs, {
      add: (job: JobData, err?: BossHelperError, logdata?: LogData, msg?: string) => {
        const state = !err ? 'success' : err.state
        const message = msg ?? (err ? err.message : undefined)
        this.appendLog({
          job,
          jobKey: job.key,
          title: job.jobName,
          step: err?.name ?? '岗位处理',
          state,
          state_name: err?.name ?? '投递成功',
          message,
          data: logdata,
        })
      },
      info: (title: string, message: string) => {
        this.appendLog({
          title,
          step: title,
          state: 'info',
          state_name: '消息',
          message,
          data: undefined,
        })
      },
      step: (
        job: JobData,
        step: string,
        state: LogState,
        message?: string,
        durationMs?: number,
      ) => {
        const stateNames: Record<LogState, string> = {
          info: '开始',
          success: '成功',
          warning: '跳过',
          danger: '失败',
        }
        this.appendLog({
          jobKey: job.key,
          title: job.jobName,
          step,
          state,
          state_name: stateNames[state],
          message,
          durationMs,
        })
      },
      init: () => this.initLogs(),
      clear: () => {
        this._logs.value = []
        this.queueLogsSave()
      },
    })

    this.chatModel = new ChatModel(this)

    this.jobResultMaps = reactive(new Map())
    this.netConf = ref(null)
  }

  private appendLog(log: Log) {
    this._logs.value.push({
      ...log,
      id: log.id ?? `${Date.now()}-${++logSequence}`,
      timestamp: log.timestamp ?? Date.now(),
    })
    if (this._logs.value.length > maxLogs) {
      this._logs.value.splice(0, this._logs.value.length - maxLogs)
    }
    void this.initLogs().then(() => this.queueLogsSave())
  }

  private initLogs() {
    if (this.logsInitialized) return Promise.resolve()
    if (this.logsInitPromise) return this.logsInitPromise

    this.logsInitPromise = counter
      .storageGet<Log[]>(logsKey, [])
      .then((storedLogs) => {
        const currentLogs = this._logs.value
        const seen = new Set<string>()
        this._logs.value = [...storedLogs, ...currentLogs]
          .filter((log) => {
            if (!log.id) return true
            if (seen.has(log.id)) return false
            seen.add(log.id)
            return true
          })
          .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
          .slice(-maxLogs)
        this.logsInitialized = true
      })
      .catch((error) => {
        logger.error('日志加载失败', error)
        this.logsInitialized = true
      })
      .finally(() => {
        this.logsInitPromise = null
      })
    return this.logsInitPromise
  }

  private queueLogsSave() {
    const snapshot = jsonClone(this._logs.value.slice(-maxLogs))
    this.logsSaveQueue = this.logsSaveQueue
      .catch(() => undefined)
      .then(async () => {
        await counter.storageSet(logsKey, snapshot)
      })
      .catch((error) => {
        logger.error('日志保存失败', error)
      })
  }

  abstract loadMoreJob(delay: Promise<any>): Promise<boolean>
  abstract onMount(): Promise<void>
  abstract getConfigItems(): ComputedRef<[AlertItem[], (ConfigAccordionItem | false)[]]>

  abstract start(): Promise<void>
  abstract preflight(): Promise<PreflightReport>
  abstract simulate(): Promise<SimulationResult | null>
  abstract sendMessage(data: WorkflowData<T, S>, msg: FormDataInput['value']): Promise<void>
  abstract get uid(): string
  abstract get userInfo(): {
    id: string
    name: string
    avatar: string
  }
  abstract get key(): string
  abstract get label(): string

  private async refreshNetConf() {
    try {
      this.netConf.value = await initNetConf()
    } catch (error) {
      logger.error('网络配置加载失败', error)
    }
  }

  initNetConf() {
    void this.refreshNetConf()
    if (!this.netConfTimer) {
      this.netConfTimer = setInterval(
        () => {
          void this.refreshNetConf()
        },
        1000 * 60 * 5,
      )
    }
  }

  stop() {
    this.workflow?.stop()
  }
  reset() {
    this.workflow?.reset()
  }
  async notification(
    msg: string,
    opt?: {
      notification?: typeof notification extends (
        message: string,
        options?: infer O,
      ) => Promise<any>
        ? O
        : never
      toast: Partial<Toast>
    },
  ) {
    const toast = useToast()
    if (this.conf.formData.notification.value && document.visibilityState !== 'visible') {
      await notification(msg, opt?.notification)
    }
    toast.add({
      ...opt?.toast,
      title: msg,
    })
  }

  async onJobCardClick(_key: string) {
    throw new Error('Method not implemented.')
  }
}
