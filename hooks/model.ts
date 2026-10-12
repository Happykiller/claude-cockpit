import type { Plan, PlanSummary, SessionTokens, Step, StepStatus } from '../types'

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

export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

/** The session's tally with one more request answered. */
export function addUsage(prev: SessionTokens | undefined, u: Usage): SessionTokens {
  const t = prev ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 }
  return {
    input: t.input + u.input_tokens,
    output: t.output + u.output_tokens,
    cacheRead: t.cacheRead + u.cache_read_input_tokens,
    cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
    requests: t.requests + 1,
  }
}

/** What was sent (uncached input and both cache sides), the grand total, and the share the cache served. */
export function tokenShares(t: SessionTokens) {
  const sent = t.input + t.cacheRead + t.cacheWrite
  return { sent, total: sent + t.output, readPct: sent > 0 ? (t.cacheRead / sent) * 100 : 0 }
}

/** `total` cells cut into `parts` runs as even as cells allow, the longer ones spread out. */
export function spread(total: number, parts: number): number[] {
  if (parts <= 0) return []
  const t = Math.max(parts, total)
  return Array.from({ length: parts }, (_, i) => Math.floor(((i + 1) * t) / parts) - Math.floor((i * t) / parts))
}

const ENDED = /^(completed|failed|killed|stopped|cancell?ed|error)$/i

/** The tasks a background notification reports ended, by id: one `<task-notification>` block each. */
export function endedTasks(text: string): string[] {
  return [...text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)].flatMap(m => {
    const id = /<task-id>\s*([^<\s]+)\s*<\/task-id>/.exec(m[1]!)?.[1]
    const status = /<status>\s*([^<\s]+)\s*<\/status>/.exec(m[1]!)?.[1]
    return id && status && ENDED.test(status) ? [id] : []
  })
}

/** Whether an agent the engine lists has stopped running. */
export function isEnded(status: string): boolean {
  return ENDED.test(status)
}

export const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

export type Tone = 'ok' | 'warn' | 'hot'
export function tone(pct: number | undefined): Tone {
  if (pct === undefined || pct < 75) return 'ok'
  return pct < 90 ? 'warn' : 'hot'
}

/** How the footer spells each mode's pill, across the versions seen. */
const MODE_PILLS: readonly [RegExp, string][] = [
  [/\bbypass permissions\b/, 'bypassPermissions'],
  [/\bauto mode\b/, 'auto'],
  [/\b(?:auto-)?accept(?:ing)? edits\b/, 'acceptEdits'],
  [/\bplan mode\b/, 'plan'],
  [/\bdon'?t ask\b/, 'dontAsk'],
  [/\b(?:manual|default) mode\b/, 'default'],
]

/**
 * The mode a footer's pill names, if it shows one. The pill leads the line,
 * so the earliest match wins over a mode named further on.
 */
export function pillOf(text: string): string | undefined {
  const t = text.toLowerCase()
  let best: { at: number; mode: string } | undefined
  for (const [re, mode] of MODE_PILLS) {
    const at = t.search(re)
    if (at >= 0 && (!best || at < best.at)) best = { at, mode }
  }
  return best?.mode
}

// ── The permission mode, followed through shift+tab ───────────────────────
//
// As shift+tab moves on, the footer is read once more with the pill of the
// mode it leaves (`plan mode on`), then at once without any pill: the flash
// names the mode left, the cycle names the one entered. A pill still the
// last read after FLASH_MS is the mode itself.

/** The cycle shift+tab follows unless this person's own has been seen. */
export const MODE_CYCLE: Readonly<Record<string, string>> = { default: 'acceptEdits', acceptEdits: 'plan', plan: 'auto', auto: 'default' }
/** How soon the next read follows a pill when the pill was the line left behind. */
export const FLASH_MS = 100

export type ModeTracker = {
  /** Each mode's successor under shift+tab, as seen so far. */
  cycle: Record<string, string>
  /** A pill read last, not yet known as a flash or the mode itself. */
  pill?: { mode: string; at: number; text: string }
  /** The mode shift+tab left last, until the mode it led to is known. */
  left?: string
}

export function modeTracker(cycle?: Record<string, string>): ModeTracker {
  return { cycle: { ...MODE_CYCLE, ...cycle } }
}

/** A mode known for sure: it ends a shift+tab, and teaches the cycle where it went. */
export function arriveMode(tk: ModeTracker, mode: string): string {
  if (tk.left !== undefined && tk.left !== mode) tk.cycle[tk.left] = mode
  tk.left = undefined
  return mode
}

function leaveMode(tk: ModeTracker, mode: string): string | undefined {
  // The flash names the mode the previous shift+tab led to.
  arriveMode(tk, mode)
  tk.left = mode
  return tk.cycle[mode]
}

/** One read of the footer's hint; the mode it settles, if it settles one. */
export function readFooter(tk: ModeTracker, text: string, at: number): string | undefined {
  let settled: string | undefined
  const p = tk.pill
  if (p && text !== p.text) {
    tk.pill = undefined
    settled = at - p.at <= FLASH_MS ? leaveMode(tk, p.mode) : arriveMode(tk, p.mode)
  }
  const pill = pillOf(text)
  if (pill) {
    if (!tk.pill) tk.pill = { mode: pill, at, text }
  } else if (text.toLowerCase().includes('? for shortcuts')) {
    settled = arriveMode(tk, 'default')
  }
  return settled
}

/** A pill nothing followed within FLASH_MS: the mode itself. */
export function settleFooter(tk: ModeTracker, at: number): string | undefined {
  const p = tk.pill
  if (!p || at - p.at <= FLASH_MS) return undefined
  tk.pill = undefined
  return arriveMode(tk, p.mode)
}

// ── Versions ──────────────────────────────────────────────────────────────

/** `v0.3.0` or `0.3.0` → `0.3.0`; undefined when it is not a release number. */
export function releaseOf(tag: unknown): string | undefined {
  const m = typeof tag === 'string' ? /^v?(\d+\.\d+\.\d+)$/.exec(tag.trim()) : null
  return m?.[1]
}

/** Whether release `b` comes after release `a`. */
export function isNewer(a: string, b: string): boolean {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (y[i] !== x[i]) return (y[i] ?? 0) > (x[i] ?? 0)
  return false
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

/**
 * Moves one step. A step closed without having been opened starts where the
 * last one ended, and says its time is a guess (`untimed`).
 */
export function moveStep(plan: Plan, index: number, status: StepStatus, now: number, extra: { note?: string; estimateMin?: number } = {}): Plan {
  const steps = plan.steps.map(s => ({ ...s }))
  const step = steps[index]
  if (!step) return plan
  const lastEnd = Math.max(plan.createdAt, ...steps.map(s => s.endedAt ?? 0))
  if (status === 'in_progress' || status === 'blocked') {
    if (step.untimed) {
      step.startedAt = now
      delete step.untimed
    }
    step.startedAt ??= now
    step.endedAt = undefined
  }
  if (status === 'in_progress') {
    for (const other of steps) if (other !== step && other.status === 'in_progress') other.status = 'pending'
  }
  if (status === 'completed' || status === 'skipped') {
    if (step.startedAt === undefined) {
      step.startedAt = lastEnd
      step.untimed = true
    }
    step.endedAt = now
  }
  step.status = status
  if (extra.note !== undefined && extra.note !== step.note) {
    if (step.note) step.done = [...(step.done ?? []), step.note].slice(-4)
    step.note = extra.note
  }
  if (extra.estimateMin !== undefined) step.estimateMin = extra.estimateMin
  const isFinished = steps.some(s => s.status === 'completed') && steps.every(s => s.status === 'completed' || s.status === 'skipped')
  return { ...plan, steps, finishedAt: isFinished ? (plan.finishedAt ?? now) : undefined }
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
    finishedAt: known?.finishedAt,
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

// ── What the clock teaches about the estimates ─────────────────────────────

/** `[estimated minutes, real minutes]` of each step `next` closed on the clock and `prev` had open. */
export function measured(prev: Plan | null, next: Plan): [number, number][] {
  const out: [number, number][] = []
  next.steps.forEach(s => {
    if (s.status !== 'completed' || s.untimed || s.estimateMin === undefined || s.startedAt === undefined || s.endedAt === undefined) return
    const was = prev?.steps.find(p => p.id === s.id)
    if (was?.status === 'completed') return
    out.push([s.estimateMin, (s.endedAt - s.startedAt) / MIN])
  })
  return out
}

export const CALIBRATION_MIN = 5

/** One step on the time axis: when it began (or should), when it ended (or should). */
export type Span = { start: number; end: number; isStartReal: boolean }
export type Timeline = { spans: Span[]; end: number; isEndReal: boolean }

/**
 * The plan laid on the clock: a started step from its real start, a running one
 * to its estimate or to now past it, a pending one after the one before. A step
 * with no estimate takes no time, the remaining total saying `+?` for it.
 */
export function timeline(plan: Plan, now: number): Timeline {
  let cursor = plan.steps.find(s => s.startedAt !== undefined)?.startedAt ?? plan.createdAt
  const spans = plan.steps.map(s => {
    const start = s.startedAt ?? (s.status === 'pending' ? Math.max(cursor, now) : cursor)
    const end = spanEnd(s, start, now)
    cursor = Math.max(cursor, end)
    return { start, end, isStartReal: s.startedAt !== undefined }
  })
  const allDone = plan.steps.length > 0 && plan.steps.every(s => s.status === 'completed' || s.status === 'skipped')
  return { spans, end: cursor, isEndReal: allDone }
}

function spanEnd(s: Step, start: number, now: number): number {
  const est = (s.estimateMin ?? 0) * MIN
  switch (s.status) {
    case 'completed':
    case 'skipped':
      return s.endedAt ?? start
    case 'pending':
      return start + est
    default:
      return Math.max(now, start + est)
  }
}

/** `total` cells shared by weight, each part given `min` first when there is room for it. */
export function apportion(weights: readonly number[], total: number, min: number): number[] {
  const n = weights.length
  if (n === 0) return []
  const floor = total >= min * n ? min : Math.max(1, Math.floor(total / n))
  const rest = Math.max(0, total - floor * n)
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0)
  if (sum <= 0) return spread(floor * n + rest, n)
  const exact = weights.map(w => (Math.max(0, w) / sum) * rest)
  const out = exact.map(x => floor + Math.floor(x))
  let left = floor * n + rest - out.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    out[i]!++
    left--
  }
  return out
}

/** A label for one line of `width` cells: its column, or `right` to end on the line's end. */
export type Label = { col: number; text: string; right?: true }

/**
 * Keeps the labels that fit, in the order given (the first ones win), each a
 * cell clear of the others and inside the line; returns them left to right.
 */
export function placeLabels<L extends Label>(width: number, labels: readonly L[]): (L & { at: number })[] {
  const kept: (L & { at: number })[] = []
  for (const l of labels) {
    const at = l.right ? width - l.text.length : l.col
    const to = at + l.text.length
    if (at < 0 || to > width) continue
    if (kept.some(k => at < k.at + k.text.length + 1 && k.at < to + 1)) continue
    kept.push({ ...l, at })
  }
  return kept.sort((a, b) => a.at - b.at)
}

/** Real over estimated, summed so long steps weigh as they cost; absent below five steps. */
export function ratioOf(samples: readonly (readonly [number, number])[]): number | undefined {
  if (samples.length < CALIBRATION_MIN) return undefined
  const est = samples.reduce((sum, [e]) => sum + e, 0)
  const real = samples.reduce((sum, [, r]) => sum + r, 0)
  return est > 0 ? real / est : undefined
}

export function summarize(plan: Plan, now: number): PlanSummary {
  const live = plan.steps.filter(s => s.status !== 'skipped')
  return {
    title: plan.title,
    finishedAt: plan.finishedAt ?? now,
    steps: live.length,
    estimateMin: live.reduce((sum, s) => sum + (s.estimateMin ?? 0), 0),
    realMs: (plan.finishedAt ?? now) - Math.min(plan.createdAt, ...live.map(s => s.startedAt ?? plan.createdAt)),
  }
}

/** `×1,4` */
export function fmtRatio(r: number): string {
  return `×${r.toFixed(1).replace('.', ',')}`
}

// ── Where the 5-hour window is heading ─────────────────────────────────────

export type Projection = { kind: 'cap'; at: number } | { kind: 'reset'; pct: number }

const SPAN_MIN = 10 * MIN
const SPAN_MAX = 45 * MIN

/**
 * At the pace of the last three quarters of an hour (ten minutes at least):
 * the moment the window fills, if that comes before it renews, else where it
 * will stand when it does. Nothing while the pace cannot be read.
 */
export function project(trail: readonly (readonly [number, number])[], resetsAt: number | undefined, now: number): Projection | undefined {
  const last = trail.at(-1)
  if (!last || resetsAt === undefined || resetsAt <= now) return undefined
  const from = trail.find(([t]) => t >= last[0] - SPAN_MAX)
  if (!from || last[0] - from[0] < SPAN_MIN) return undefined
  const rate = (last[1] - from[1]) / (last[0] - from[0])
  if (rate <= 0) return { kind: 'reset', pct: last[1] }
  const at = last[0] + (100 - last[1]) / rate
  if (at < resetsAt) return { kind: 'cap', at: Math.max(now, at) }
  return { kind: 'reset', pct: Math.min(100, last[1] + rate * (resetsAt - last[0])) }
}
