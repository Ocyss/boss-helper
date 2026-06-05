import type { MyJobListData } from '@/stores/jobs'
import type { logData } from '@/stores/log'

export interface StepArgs {
  data: MyJobListData
}

export type Pipeline = Array<Step | Pipeline>
export type Handler = (args: StepArgs, ctx: logData) => Promise<void>
export type Step =
  | undefined
  | Handler
  | {
      fn?: Handler
      after?: Handler
    }
export type StepFactory = () => Step | Pipeline
