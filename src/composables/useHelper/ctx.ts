import type { Toast } from '@nuxt/ui/runtime/composables/useToast.js'
import { extendRef } from '@vueuse/core'
import type { Reactive } from 'vue'
import { ref, watch } from 'vue'
import type { Ref } from 'vue'

import { useConf } from '@/composables/conf'
import { useAccounts } from '@/composables/useAccounts'
import type { DeliveryWorkflow } from '@/composables/useApplying'
import type { BossHelperError } from '@/composables/useApplying/deliverError'
import type { TaskResult, WorkflowData } from '@/composables/useApplying/type'
import { useModel } from '@/composables/useModel'
import { ChatModel } from '@/composables/useModel'
import type { FormDataInput } from '@/types/formData'

import { HelperCache } from './cache'
import { JobResultCache } from './jobCache'
import type { NetConf } from './netConf'
import { initNetConf } from './netConf'
import type { Log, JobData, LogData, ConfigAccordionItem, AlertItem } from './type'

export abstract class HelperContext<C extends HelperContext<C, T, S>, T, S> {
  shadowRoot: ShadowRoot | null = null
  netConf: Ref<NetConf | null>
  netConfTimer: NodeJS.Timeout | null = null
  conf: ReturnType<typeof useConf>
  accounts: ReturnType<typeof useAccounts>
  models: ReturnType<typeof useModel>
  statistics: ReturnType<typeof useStatistics>

  chatModel: ChatModel
  cache: HelperCache
  jobCache: JobResultCache
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

  constructor() {
    this.conf = useConf()
    this.accounts = useAccounts()
    this.models = useModel()
    this.statistics = useStatistics()
    this.currentJob = ref(null)
    this._logs = ref([])
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
          data: logdata,
        })
      },
      info: (title: string, message: string) => {
        this._logs.value.push({
          title,
          state: 'info',
          state_name: '消息',
          message,
          data: undefined,
        })
      },
      clear: () => {
        this._logs.value = []
      },
    })

    this.chatModel = new ChatModel(this)
    this.cache = new HelperCache(() => this.accounts.activeAccount.value)
    this.jobCache = new JobResultCache(() => this.accounts.activeAccount.value)

    this.jobResultMaps = reactive(new Map())
    this.netConf = ref(null)
    watch(
      this.accounts.activeAccount,
      () => {
        this.jobResultMaps.clear()
        this.workflow?.stateMaps.value.clear()
        this.workflow?.drafts.clear()
        this.workflow?.manuallyFiltered.clear()
        for (const data of this.jobMaps?.values() ?? []) data.state = {}
        for (const job of this.jobList?.value ?? []) this.restoreJobCache(job.key)
      },
      { flush: 'sync' },
    )
  }

  restoreJobCache(key: string): void {
    if (!this.conf.formData.useCache.value || this.jobResultMaps.has(key)) return
    const account = this.accounts.activeAccount.value
    void this.jobCache
      .get(key, this.conf.formData.useCache.expire)
      .then((cached) => {
        if (
          cached &&
          this.accounts.activeAccount.value === account &&
          this.conf.formData.useCache.value &&
          !this.jobResultMaps.has(key)
        ) {
          this.jobResultMaps.set(key, cached)
        }
      })
      .catch((error) => logger.error('恢复岗位缓存失败', error))
  }

  abstract loadMoreJob(delay: Promise<any>): Promise<boolean>
  abstract onMount(): Promise<void>
  abstract getConfigItems(): ComputedRef<[AlertItem[], (ConfigAccordionItem | false)[]]>

  abstract start(mode?: 'auto' | 'filter' | 'generate' | 'delivery'): Promise<void>
  abstract hasJobDetails(key: string): boolean
  private detailRequests = new Map<string, Promise<void>>()
  jobActionBusy = ref(false)

  async fetchJobDetails(key: string): Promise<void> {
    const pending = this.detailRequests.get(key)
    if (pending) return pending
    if (this.workflowRunning.value || this.jobActionBusy.value) {
      throw new Error('工作流或岗位操作正在运行，请稍后再试')
    }
    this.jobActionBusy.value = true
    const request = this.onJobCardClick(key).finally(() => {
      this.detailRequests.delete(key)
      this.jobActionBusy.value = false
    })
    this.detailRequests.set(key, request)
    return request
  }

  filterJob(key: string) {
    if (!this.workflow) throw new Error('工作流尚未初始化')
    this.workflow.markFiltered(key)
  }

  async deliverJob(key: string): Promise<void> {
    if (!this.workflow || this.workflowRunning.value || this.jobActionBusy.value) {
      throw new Error('工作流不可用或正在运行，请稍后再试')
    }
    const data = this.jobMaps.get(key)
    if (!data) throw new Error('未找到岗位数据，请刷新页面')
    this.jobActionBusy.value = true
    try {
      this.workflow.manuallyFiltered.delete(key)
      const accepted = await this.workflow.executeOne(data, 'delivery')
      const result = this.jobResultMaps.get(key)
      if (!accepted || result?.status === 'error') {
        throw new Error(result?.reason ?? this.workflow.errorMessage.value ?? '投递未执行')
      }
    } finally {
      this.jobActionBusy.value = false
    }
  }
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
    void initNetConf().then((data) => {
      this.netConf.value = data
    })
    if (!this.netConfTimer) {
      this.netConfTimer = setInterval(
        () => {
          void initNetConf().then((data) => {
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

  setShadowRoot(shadow: ShadowRoot) {
    this.shadowRoot = shadow
  }
}
