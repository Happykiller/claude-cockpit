export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped'

export type Step = {
  id: string
  title: string
  status: StepStatus
  estimateMin?: number
  startedAt?: number
  endedAt?: number
  note?: string
  /** The notes it had before this one, oldest first: the step's sub-steps. */
  done?: string[]
}

export type PlanSource = 'cockpit' | 'todo' | 'tasks'

export type Plan = {
  title: string
  source: PlanSource
  createdAt: number
  steps: Step[]
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Activity = {
  model?: string
  effort?: string
  mode?: string
  contextTokens?: number
  contextWindow?: number
  contextPercent?: number
  limits: Limit[]
  costUsd?: number
  startedAt?: number
  /** The context window's fill, one reading per measure, newest last. */
  history: number[]
  /** Output tokens of each main-loop request, newest last. */
  flow: number[]
  /** The window by category, as /context estimates it. */
  parts?: ContextParts
  /** Minutes east of UTC, as the host's `date +%z` says. */
  tzOffsetMin?: number
}

export type ContextParts = { system: number; tools: number; messages: number; buffer: number; max: number }

export type Tick = { n: number; now: number }

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      tick: Tick
      activity: Activity
      plan: Plan | null
      working: boolean
    }
  }
}
