import { Toast } from '@nuxt/ui/runtime/composables/useToast.js'
import { extendRef } from '@vueuse/core'
import { Reactive, ref } from 'vue'
import { Ref } from 'vue'

import { useConf } from '@/composables/conf'
import { DeliveryWorkflow } from '@/composables/useApplying'
import type { BossHelperError } from '@/composables/useApplying/deliverError'
import { TaskResult, WorkflowData } from '@/composables/useApplying/type'
import { useModel } from '@/composables/useModel'
import { ChatModel } from '@/composables/useModel'
import { counter } from '@/message'
import { FormDataInput } from '@/types/formData'
import { v2StorageKey } from '@/utils/namespace'

import { initNetConf, NetConf } from './netConf'
import { Log, JobData, LogData, ConfigAccordionItem, AlertItem } from './type'

const logsStorageKey = v2StorageKey('logs')

export abstract class HelperContext<C extends HelperContext<C, T, S>, T, S> {
  netConf: Ref<NetConf | null>
  netConfTimer: NodeJS.Timeout | null = null
  conf: ReturnType<typeof useConf>
  models: ReturnType<typeof useModel>
  statistics: ReturnType<typeof useStatistics>

  chatModel: ChatModel
  workflow: DeliveryWorkflow<C, T, S> | null = null
  workflowRunning = computed(() => this.workflow?.status.value === 'running')
  jobResultMaps: Reactive<Map<string, TaskResult>>

  abstract jobList: Ref<JobData[]>
  abstract jobMaps: Map<string, WorkflowData<T, S>>

  currentJob: Ref<string | null>
  _logs: Ref<Log[]>
  logs: {
    add: (job: JobData, err?: BossHelperError, logdata?: LogData, msg?: string) => void
    info: (title: string, message: string) => void
    clear: () => void
    value: Log[]
  }
  pendingMessages: Ref<string | undefined>
  constructor() {
    this.pendingMessages = ref()
    this.conf = useConf()
    this.models = useModel()
    this.statistics = useStatistics()
    this.currentJob = ref(null)
    this._logs = ref([])
    // 启动时恢复脱敏日志，限制数量避免持久化数据无限增长。
    void counter.storageGet<Log[]>(logsStorageKey, []).then((items) => {
      this._logs.value = Array.isArray(items) ? items.slice(-200) : []
    })
    this.logs = extendRef(this._logs, {
      add: (job: JobData, err?: BossHelperError, logdata?: LogData, msg?: string) => {
        const state = !err ? 'success' : err.state
        const message = msg ?? (err ? err.message : undefined)
        this._logs.value.push({
          job,
          title: job.jobName,
          state,
          state_name: err?.name ?? '投递成功',
          message,
          time: new Date().toISOString(),
          data: logdata,
        })
        this._logs.value = this._logs.value.slice(-200)
        void counter.storageSet(logsStorageKey, this._logs.value.slice(-200).map(sanitizeLog))
      },
      info: (title: string, message: string) => {
        this._logs.value.push({
          title,
          state: 'info',
          state_name: '消息',
          message,
          time: new Date().toISOString(),
          data: undefined,
        })
        this._logs.value = this._logs.value.slice(-200)
        void counter.storageSet(logsStorageKey, this._logs.value.slice(-200).map(sanitizeLog))
      },
      clear: () => {
        this._logs.value = []
        void counter.storageSet(logsStorageKey, [])
      },
    })

    this.chatModel = new ChatModel(this)

    this.jobResultMaps = reactive(new Map())
    this.netConf = ref(null)
  }

  abstract loadMoreJob(delay: Promise<any>): Promise<boolean>
  abstract onMount(): Promise<void>
  abstract getConfigItems(): ComputedRef<[AlertItem[], (ConfigAccordionItem | false)[]]>

  abstract start(): Promise<void>
  abstract sendMessage(data: WorkflowData<T, S>, msg: FormDataInput['value']): Promise<void>
  abstract get uid(): string
  abstract get userInfo(): {
    id: string
    name: string
    avatar: string
  }
  abstract get key(): string
  abstract get label(): string

  initNetConf() {
    initNetConf().then((data) => {
      this.netConf.value = data
    })
    if (!this.netConfTimer) {
      this.netConfTimer = setInterval(
        () => {
          initNetConf().then((data) => {
            this.netConf.value = data
          })
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

/** 仅保留日志展示所需字段，移除职位对象与 AI 原始问答中的敏感数据。 */
function sanitizeLog(log: Log): Log {
  const message = log.message
    ?.replace(/bearer\s+[^\s]+/giu, '[已隐藏凭据]')
    .replace(/(?:sk|key|token)[-_][a-z0-9._-]{8,}/giu, '[已隐藏凭据]')
    .slice(0, 500)
  return {
    title: log.title,
    state: log.state,
    state_name: log.state_name,
    message,
    time: log.time,
  }
}
