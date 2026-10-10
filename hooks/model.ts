import type { Plan, Step, StepStatus } from '../types'

export const MIN = 60_000

const FAMILIES: Record<string, string> = { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', fable: 'Fable' }

/** `claude-opus-5-5[1m]` → `Opus 5.5`; an alias or an unknown id stays as given. */
export function prettyModel(id: string | undefined): string {
  if (!id) return '—'
  const m = /(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?!\d)/i.exec(id)
  if (!m) return id
  const family = FAMILIES[m[1]!.toLowerCase()] ?? m[1]!
  return m[3] ? `${family} ${m[2]}.${m[3]}` : `${family} ${m[2]}`
}

/** 412_000 → `412 k`; 1_000_000 → `1 M`. */
export function fmtTokens(n: number | undefined): string {
  if (n === undefined) return '—'
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} M`
  if (n >= 1000) return `${Math.round(n / 1000)} k`
  return String(n)
}

/** A duration as the cockpit spells it: `45 s`, `38 min`, `1 h 05`, `3 j 4 h`. */
export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)} j ${h % 24} h`
}

export function fmtEstimate(min: number | undefined): string {
  return min === undefined ? '?' : fmtDur(min * MIN)
}

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

/** Local wall-clock parts of an epoch, the offset (minutes east of UTC) given. */
function local(ms: number, offsetMin: number): Date {
  return new Date(ms + offsetMin * MIN)
}

export function fmtClock(ms: number, offsetMin: number, withSeconds = false): string {
  const d = local(ms, offsetMin)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return withSeconds ? `${hh}:${mm}:${String(d.getUTCSeconds()).padStart(2, '0')}` : `${hh}:${mm}`
}

/** `11:56` today, `lun. 13:00` beyond. */
export function fmtWhen(ms: number, now: number, offsetMin: number): string {
  const a = local(ms, offsetMin)
  const b = local(now, offsetMin)
  const sameDay = a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
  const clock = fmtClock(ms, offsetMin)
  return sameDay ? clock : `${DAYS[a.getUTCDay()]} ${clock}`
}

const PARTIAL = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** A gauge of `width` cells at `pct`, eighths of a cell resolved. */
export function bar(pct: number, width: number): { full: string; empty: string } {
  const w = Math.max(1, width)
  const exact = (Math.min(100, Math.max(0, pct)) / 100) * w
  const whole = Math.floor(exact)
  const part = whole < w ? PARTIAL[Math.floor((exact - whole) * 8)] ?? '' : ''
  const used = whole + (part ? 1 : 0)
  return { full: '█'.repeat(whole) + part, empty: '░'.repeat(Math.max(0, w - used)) }
}

const RAMP = '▁▂▃▄▅▆▇█'

export function sparkline(values: readonly number[], width: number): string {
  const tail = values.slice(-width)
  if (tail.length === 0) return ''
  const lo = Math.min(...tail)
  const hi = Math.max(...tail)
  return tail.map(v => RAMP[hi === lo ? 3 : Math.min(7, Math.floor(((v - lo) / (hi - lo)) * 7.999))]).join('')
}

/** The idle wave: a slow swell that moves with the tick. */
export function wave(n: number, width: number): string {
  let s = ''
  for (let i = 0; i < width; i++) {
    const v = Math.sin((i - n / 2) * 0.45) * 0.5 + 0.5
    s += RAMP[Math.min(7, Math.floor(v * v * 8))]
  }
  return s
}

export const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

export type Tone = 'ok' | 'warn' | 'hot'
export function tone(pct: number | undefined): Tone {
  if (pct === undefined || pct < 75) return 'ok'
  return pct < 90 ? 'warn' : 'hot'
}

/** The permission mode the prompt footer names, if it names one. */
export function modeFromHint(text: string): string | undefined {
  const t = text.toLowerCase()
  if (t.includes('bypass')) return 'bypassPermissions'
  if (t.includes('auto mode')) return 'auto'
  if (t.includes('accept edits')) return 'acceptEdits'
  if (t.includes('plan mode')) return 'plan'
  if (t.includes("don't ask") || t.includes('dont ask')) return 'dontAsk'
  if (t.includes('? for shortcuts')) return 'default'
  return undefined
}

/** `(~20 min)`, `~1 h 30`, `[45min]` in a todo's text → minutes. */
export function parseEstimate(text: string): number | undefined {
  const h = /~?\s*(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d{1,2}))?/i.exec(text)
  if (h && /[~(\[]/.test(text)) return Math.round(parseFloat(h[1]!.replace(',', '.')) * 60 + (h[2] ? +h[2] : 0))
  const m = /~\s*(\d+)\s*min|\((\d+)\s*min\)|\[(\d+)\s*min\]/i.exec(text)
  if (m) return +(m[1] ?? m[2] ?? m[3])!
  return undefined
}

export function stripEstimate(text: string): string {
  return text.replace(/\s*[(\[]?~?\s*\d+(?:[.,]\d+)?\s*(?:h(?:\s*\d{1,2})?|min)[)\]]?\s*$/i, '').trim() || text
}

// ── The plan's transitions ─────────────────────────────────────────────────

export type PlanInput = { title?: string; steps: { title: string; estimate_min?: number }[]; mode?: 'replace' | 'append' }

export function setPlan(prev: Plan | null, input: PlanInput, now: number): Plan {
  const base = input.mode === 'append' && prev ? prev : null
  const offset = base ? base.steps.length : 0
  const added: Step[] = input.steps.map((s, i) => ({
    id: String(offset + i + 1),
    title: s.title,
    status: 'pending',
    estimateMin: s.estimate_min,
  }))
  return {
    title: input.title ?? base?.title ?? 'Plan',
    source: 'cockpit',
    createdAt: base?.createdAt ?? now,
    steps: [...(base?.steps ?? []), ...added],
  }
}

/** Moves one step; whatever it skipped over starts where the last one ended. */
export function moveStep(plan: Plan, index: number, status: StepStatus, now: number, extra: { note?: string; estimateMin?: number } = {}): Plan {
  const steps = plan.steps.map(s => ({ ...s }))
  const step = steps[index]
  if (!step) return plan
  const lastEnd = Math.max(plan.createdAt, ...steps.map(s => s.endedAt ?? 0))
  if (status === 'in_progress') {
    step.startedAt ??= now
    step.endedAt = undefined
    for (const other of steps) if (other !== step && other.status === 'in_progress') other.status = 'pending'
  }
  if (status === 'completed' || status === 'skipped') {
    step.startedAt ??= lastEnd
    step.endedAt = now
  }
  if (status === 'blocked') step.startedAt ??= now
  step.status = status
  if (extra.note !== undefined && extra.note !== step.note) {
    if (step.note) step.done = [...(step.done ?? []), step.note].slice(-4)
    step.note = extra.note
  }
  if (extra.estimateMin !== undefined) step.estimateMin = extra.estimateMin
  return { ...plan, steps }
}

type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }

/** A TodoWrite list folded into the plan, timings kept for the steps it already knew. */
export function fromTodos(prev: Plan | null, todos: readonly Todo[], now: number): Plan | null {
  if (todos.length === 0) return null
  const known = prev?.source === 'todo' ? prev : null
  let plan: Plan = {
    title: known?.title ?? 'Tâches',
    source: 'todo',
    createdAt: known?.createdAt ?? now,
    steps: todos.map((t, i) => {
      const title = stripEstimate(t.content)
      const was = known?.steps.find(s => s.title === title)
      return { ...(was ?? {}), id: String(i + 1), title, status: was?.status ?? 'pending', estimateMin: parseEstimate(t.content) ?? was?.estimateMin, note: t.status === 'in_progress' ? t.activeForm : undefined }
    }),
  }
  todos.forEach((t, i) => {
    if (plan.steps[i]!.status !== t.status) plan = moveStep(plan, i, t.status, now)
  })
  return plan
}

export function addTask(prev: Plan | null, id: string, title: string, estimateMin: number | undefined, now: number): Plan {
  const base: Plan = prev?.source === 'tasks' ? prev : { title: 'Tâches', source: 'tasks', createdAt: now, steps: [] }
  return { ...base, steps: [...base.steps, { id, title, status: 'pending', estimateMin }] }
}

// ── What the frieze says about time ────────────────────────────────────────

export type Totals = {
  done: number
  total: number
  current: number
  elapsedMs: number
  remainingMs: number
  hasUnknown: boolean
}

export function stepElapsed(s: Step, now: number): number {
  if (s.startedAt === undefined) return 0
  return (s.endedAt ?? now) - s.startedAt
}

export function totals(plan: Plan, now: number): Totals {
  let done = 0
  let elapsedMs = 0
  let remainingMs = 0
  let hasUnknown = false
  let current = -1
  plan.steps.forEach((s, i) => {
    if (s.status === 'completed') done++
    elapsedMs += stepElapsed(s, now)
    if (s.status === 'in_progress' || s.status === 'blocked') {
      if (current < 0) current = i
      if (s.estimateMin === undefined) hasUnknown = true
      else remainingMs += Math.max(0, s.estimateMin * MIN - stepElapsed(s, now))
    }
    if (s.status === 'pending') {
      if (s.estimateMin === undefined) hasUnknown = true
      else remainingMs += s.estimateMin * MIN
    }
  })
  if (current < 0) current = plan.steps.findIndex(s => s.status === 'pending')
  return { done, total: plan.steps.filter(s => s.status !== 'skipped').length, current, elapsedMs, remainingMs, hasUnknown }
}
