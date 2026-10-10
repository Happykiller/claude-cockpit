export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped'

export type Step = {
  id: string
  title: string
  status: StepStatus
  estimateMin?: number
  startedAt?: number
  endedAt?: number
  /** Closed without ever being opened: its start is a guess, its time not measured. */
  untimed?: true
  note?: string
  /** The notes it had before this one, oldest first: the step's sub-steps. */
  done?: string[]
}

export type PlanSource = 'cockpit' | 'todo' | 'tasks'

export type Plan = {
  title: string
  source: PlanSource
  createdAt: number
  /** When its last step closed; cleared when a step reopens. */
  finishedAt?: number
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
  /** The 5-hour window's readings `[at, percent]`, for the window `trailFor` ends. */
  trail?: [number, number][]
  trailFor?: string
}

export type ContextParts = {
  system: number
  tools: number
  messages: number
  buffer: number
  max: number
  /** The token count at which auto-compaction runs; absent when it is off. */
  compactAt?: number
}

/** Work the session left running: a shell, a subagent, a monitor. */
export type BgTask = { id: string; kind: 'shell' | 'agent' | 'other'; label: string; startedAt: number }

/** A finished plan, as the history keeps it across sessions. */
export type PlanSummary = { title: string; finishedAt: number; steps: number; estimateMin: number; realMs: number }

/** What earlier sessions taught: Claude's estimates against the clock. */
export type Memory = {
  /** Real time over estimated, over the latest measured steps; absent below five. */
  ratio?: number
  count: number
  recent: PlanSummary[]
}

export type Tick = { n: number; now: number }

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      tick: Tick
      activity: Activity
      plan: Plan | null
      working: boolean
      bg: BgTask[]
      memory: Memory
    }
  }
}
