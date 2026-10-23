import type { ElementTable, RenderChildren } from 'claude-code'

import type { Activity, BgTask, Board, BoardItem, BoardTone, Plan, Step } from '../types'
import type { BoardCounts, Label, Span, Totals } from './model'
import {
  apportion, bar, boardCounts, fmtClock, fmtDur, fmtEstimate, fmtTokens, fmtWhen, placeLabels, prettyModel, project, sparkline,
  isItemClosed, SPINNER, stepElapsed, timeline, tokenShares, tone, totals, wave, MIN,
} from './model'
import { VERSION } from './version'

export type Els = Pick<ElementTable, 'Box' | 'Text' | 'Button'>
type T = Els['Text']

export type ViewData = {
  activity: Activity
  history: readonly number[]
  plan: Plan | null
  /** The session space, apart from the plan. */
  board: Board | null
  n: number
  now: number
  working: boolean
  bg: readonly BgTask[]
  /** The dock's sections the person folded. */
  closed: readonly string[]
  tz: number
  cols: number
  rows: number
  /** Set while the person resizes the dock: the width aimed at, which `cols` is read against. */
  resize?: { target: number }
}

// The terminal's own sixteen colors (`ansi256(0..15)`: 4 blue, 6 cyan, 8
// dark gray, +8 bright), so its theme paints them: the mockup's blue leads, the semantic hues say healthy / attention /
// past due, and an empty track is a light shade, never a solid gray block.
const ACC = 'ansi256(14)'
const ACC2 = 'ansi256(4)'
const OK = 'ansi256(2)'
const WARN = 'ansi256(3)'
const HOT = 'ansi256(9)'
const DM = 'inactive'
const FA = 'ansi256(8)'
const WH = 'ansi256(15)'
const TRACK = 'ansi256(8)'
/** The session space's own hue, so it never reads as the plan. */
const SP = 'ansi256(13)'
/** The empty part of a gauge: a light shade a cut above the frames, so the gauge keeps its length. */
const EMPTY = '░'
/** A step that waits for the operator: paused, as Claude Code's own footer draws it, not failed. */
const WAIT = '⏸'
const EMPTY_TONE = DM

/** Cells kept clear on each side of the panel's body. */
const PAD_X = 2

const TONE = { ok: ACC, warn: WARN, hot: HOT } as const

const MODES: Record<string, { label: string; color: string; isSolid?: boolean }> = {
  default: { label: 'default', color: DM },
  acceptEdits: { label: '⏵⏵ accept edits', color: 'ansi256(13)', isSolid: true },
  plan: { label: '⏸ plan', color: 'ansi256(12)', isSolid: true },
  auto: { label: '⏵⏵ auto', color: WARN, isSolid: true },
  dontAsk: { label: "don't ask", color: ACC2 },
  bypassPermissions: { label: '⚠ bypass', color: HOT, isSolid: true },
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

const spaced = (s: string) => s.split('').join(' ')
const dollars = (usd: number) => `${usd.toFixed(2).replace('.', ',')} $`
/** What the session would have cost at API prices: notional on a subscription. */
const money = (usd: number | undefined) => (usd === undefined ? '—' : `≈ ${dollars(usd)} API`)

function limit(a: Activity, kind: string) {
  return a.limits.find(l => l.kind === kind)
}

function isRenewed(a: Activity, kind: string, now: number) {
  const at = limit(a, kind)?.resetsAt
  return at !== undefined && Date.parse(at) <= now
}

/** The window's use; a window past its end has renewed, whatever the last reading said. */
function used(d: ViewData, kind: string) {
  return isRenewed(d.activity, kind, d.now) ? 0 : limit(d.activity, kind)?.percentUsed
}

// ── Pieces both placements share ───────────────────────────────────────────

/** A dock section the person can fold: its key, the digit that toggles it, whether it is open. */
type Fold = { id: string; hotkey: string; isOpen: boolean }

/** The digit that toggles each dock section while the pane holds the keyboard. */
const FOLDS = { config: '1', stats: '2', activity: '3', plan: '4', board: '5' } as const

function fold(d: ViewData, id: keyof typeof FOLDS): Fold {
  return { id, hotkey: FOLDS[id], isOpen: !d.closed.includes(id) }
}

/**
 * `━━ A C T I V I T É ━━━━━━━━━━━━ right` across the whole width. With `fold`,
 * the title is a button (a click, or its digit once the pane has the keyboard)
 * led by ▾ open or ▸ folded.
 */
function Heading({ E, title, width, right, fold, color }: { E: Els; title: string; width: number; right?: RenderChildren; fold?: Fold; color?: string }) {
  const { Box, Text, Button } = E
  const label = fold ? `${fold.isOpen ? '▾' : '▸'} ${spaced(title)}` : spaced(title)
  // A plain Button with a hotkey draws it ahead, `1: `.
  const fill = Math.max(2, width - label.length - 4 - (right ? 8 : 0) - (fold ? 3 : 0))
  const parts = [<Text color={FA}>━━ </Text>, <Text bold color={color ?? (fold && !fold.isOpen ? WH : DM)}>{label}</Text>, <Text color={FA}> {'━'.repeat(fill)}</Text>]
  return (
    <Box justifyContent="space-between">
      {fold
        ? <Button key={`fold:${fold.id}`} plain hotkey={fold.hotkey} label={title} onPress={() => undefined}>{parts}</Button>
        : <Text wrap="truncate-end">{parts}</Text>}
      {right !== undefined && <Box flexShrink={0} marginLeft={1}>{right}</Box>}
    </Box>
  )
}

function Chip({ T, mode }: { T: T; mode: string | undefined }) {
  const m = (mode && MODES[mode]) || { label: mode ?? '—', color: DM }
  return <T bold inverse={m.isSolid} color={m.color}>{` ${m.label} `}</T>
}

function Effort({ T, effort }: { T: T; effort: string | undefined }) {
  const idx = effort ? EFFORTS.indexOf(effort) : -1
  const lit = (i: number) => (i > idx ? TRACK : idx === 4 ? HOT : ACC)
  return (
    <T>
      {EFFORTS.map((_, i) => <T color={lit(i)}>▮</T>)}
      <T bold color={WH}> {effort ?? '—'}</T>
      <T color={DM}> / max</T>
    </T>
  )
}

/** A solid gauge: the filled cells in their tone, the rest a dark track. */
function Bar({ T, pct, width, color }: { T: T; pct: number; width: number; color: string }) {
  const b = bar(pct, width)
  const whole = b.full.replace(/[▏▎▍▌▋▊▉]$/, '')
  const part = b.full.slice(whole.length)
  return (
    <T wrap="truncate-end">
      <T color={color}>{whole}</T>
      {part && <T color={color}>{part}</T>}
      <T color={EMPTY_TONE}>{EMPTY.repeat(b.empty.length)}</T>
    </T>
  )
}

function Gauge({ E, label, pct, width, info, n }: { E: Els; label: string; pct: number | undefined; width: number; info: [string, string, string?]; n: number }) {
  const { Box, Text } = E
  const t = tone(pct)
  const color = TONE[t]
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color={DM}>{label}</Text>
        <Text bold color={t === 'hot' && n % 8 >= 4 ? DM : color}>{pct === undefined ? '—' : `${Math.round(pct)} %`}{t === 'hot' ? ' ⚑' : ''}</Text>
      </Box>
      <Bar T={Text} pct={pct ?? 0} width={width} color={color} />
      <Box justifyContent="space-between">
        <Text color={DM} wrap="truncate-end">{info[0]}</Text>
        <Box flexShrink={0}><Text color={WH}>{info[1]}<Text color={DM}>{info[2] ?? ''}</Text></Text></Box>
      </Box>
    </Box>
  )
}

function resetInfo(d: ViewData, kind: string, lead: string): [string, string, string?] {
  const l = limit(d.activity, kind)
  if (!l) return ['pas encore de lecture', '']
  if (!l.resetsAt) return [lead, '—']
  const at = Date.parse(l.resetsAt)
  if (at <= d.now) return ['fenêtre renouvelée', 'nouvelle lecture…']
  return [lead, fmtDur(at - d.now), ` · ${fmtWhen(at, d.now, d.tz)}`]
}

/** Where the 5-hour window is heading at the current pace, and the tone that says how urgent it is. */
function projectFive(d: ViewData) {
  const l = limit(d.activity, 'five_hour')
  const p = project(d.activity.trail ?? [], l?.resetsAt ? Date.parse(l.resetsAt) : undefined, d.now)
  if (!p) return undefined
  return { p, color: p.kind === 'cap' ? (p.at - d.now < 30 * MIN ? HOT : WARN) : TONE[tone(p.pct)] }
}

/** The projection in the few words a folded line has room for. */
function paceOf(d: ViewData): { text: string; color: string } | undefined {
  const pr = projectFive(d)
  if (!pr) return undefined
  const text = pr.p.kind === 'cap' ? `⚑ 100 % vers ${fmtClock(pr.p.at, d.tz)}` : `~${Math.round(pr.p.pct)} % à la fin`
  return { text, color: pr.color }
}

/** Where the 5-hour window is heading at the current pace, in one line. */
function Pace({ E, d }: { E: Els; d: ViewData }) {
  const { Box, Text } = E
  const pr = projectFive(d)
  if (!pr) return <Text color={DM} wrap="truncate-end">au rythme actuel : pas encore lisible</Text>
  const { p, color } = pr
  if (p.kind === 'cap') {
    return (
      <Box justifyContent="space-between">
        <Text color={color} wrap="truncate-end">⚑ au rythme actuel : 100 % avant la fin</Text>
        <Box flexShrink={0} marginLeft={1}><Text bold color={color}>vers {fmtClock(p.at, d.tz)}</Text></Box>
      </Box>
    )
  }
  return (
    <Box justifyContent="space-between">
      <Text color={DM} wrap="truncate-end">au rythme actuel, à la fin de la fenêtre</Text>
      <Box flexShrink={0} marginLeft={1}><Text color={color}>~{Math.round(p.pct)} %</Text></Box>
    </Box>
  )
}

/** The context as /context splits it: system, tools, messages, free, then the compaction reserve. */
function Context({ E, d, width }: { E: Els; d: ViewData; width: number }) {
  const { Box, Text } = E
  const a = d.activity
  const p = a.parts
  const pct = a.contextPercent
  const color = TONE[tone(pct)]
  const head = (
    <Box justifyContent="space-between">
      <Text bold color={DM}>CONTEXTE</Text>
      <Box flexShrink={0}><Text><Text bold color={WH}>{fmtTokens(a.contextTokens)}</Text><Text color={DM}> / {fmtTokens(a.contextWindow)} · </Text><Text bold color={color}>{pct === undefined ? '—' : `${pct} %`}</Text></Text></Box>
    </Box>
  )
  if (!p || p.max <= 0) return <Box flexDirection="column">{head}<Bar T={Text} pct={pct ?? 0} width={width} color={color} /></Box>
  const cells = (tokens: number) => (tokens > 0 ? Math.max(1, Math.round((tokens / p.max) * width)) : 0)
  const sys = cells(p.system)
  const tools = cells(p.tools)
  const msgs = cells(p.messages)
  const buf = cells(p.buffer)
  const free = Math.max(0, width - sys - tools - msgs - buf)
  const share = (tokens: number) => `${Math.round((tokens / p.max) * 100)} %`
  return (
    <Box flexDirection="column">
      {head}
      <Text wrap="truncate-end">
        <Text color={ACC2}>{'█'.repeat(sys)}</Text><Text color={ACC2}>{'▓'.repeat(tools)}</Text><Text color={color}>{'█'.repeat(msgs)}</Text>
        <Text color={EMPTY_TONE}>{EMPTY.repeat(free)}</Text><Text color={WARN} dimColor>{'▒'.repeat(buf)}</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text color={ACC2}>█</Text><Text color={DM}> système {share(p.system)}  </Text><Text color={ACC2}>▓</Text><Text color={DM}> outils {share(p.tools)}  </Text>
        <Text color={color}>█</Text><Text color={DM}> messages {share(p.messages)}  </Text>
        <Text color={WARN} dimColor>▒</Text><Text color={DM}> réserve</Text>
      </Text>
    </Box>
  )
}

/** Output tokens per request, the newest cell lit while a turn runs. */
function Flow({ E, d, width }: { E: Els; d: ViewData; width: number }) {
  const { Box, Text } = E
  const a = d.activity
  const lastOut = a.flow.at(-1)
  const right = lastOut === undefined ? '' : `dernière réponse ↓ ${fmtTokens(lastOut)}`
  const room = Math.max(4, Math.min(24, width - 'DÉBIT  '.length - right.length - 1))
  const line = sparkline(a.flow, room)
  return (
    <Box justifyContent="space-between">
      <Text wrap="truncate-end">
        <Text bold color={DM}>DÉBIT  </Text>
        {line
          ? <Text><Text color={ACC}>{line.slice(0, -1)}</Text><Text bold color={d.working && d.n % 6 < 3 ? WH : ACC}>{line.slice(-1)}</Text></Text>
          : <Text color={FA}>{wave(d.n, Math.min(12, room))}</Text>}
      </Text>
      {lastOut !== undefined && (
        <Box flexShrink={0} marginLeft={1}>
          <Text><Text color={DM}>dernière réponse </Text><Text color={WARN}>↓</Text><Text color={WH}> {fmtTokens(lastOut)}</Text></Text>
        </Box>
      )}
    </Box>
  )
}

/** The least a step takes on the frieze: room for the hour under its node. */
const SEG_MIN = 6

type Tag = Label & { color: string; bold?: boolean }

/** One line of labels at their columns, blanks between. */
function Tags({ T, tags }: { T: T; tags: readonly (Tag & { at: number })[] }) {
  let c = 0
  const out: RenderChildren[] = []
  for (const t of tags) {
    out.push(' '.repeat(t.at - c), <T bold={t.bold} color={t.color}>{t.text}</T>)
    c = t.at + t.text.length
  }
  return <T wrap="truncate-end">{out}</T>
}

/**
 * The frieze across the whole width: a node where each step began, ⚑ where the
 * plan ends, each step as long as it lasts. With `labels`, the step ids above
 * and the hours below: real, running, or expected (`~`).
 */
function Rail({ E, plan, d, width, current, labels }: { E: Els; plan: Plan; d: ViewData; width: number; current: number; labels?: boolean }) {
  const { Box, Text } = E
  const count = plan.steps.length
  const tl = timeline(plan, d.now)
  const gaps = apportion(tl.spans.map(s => s.end - s.start), width - count - 1, labels ? SEG_MIN : 1)
  const cols: number[] = []
  gaps.reduce((c, g) => (cols.push(c), c + 1 + g), 0)
  const blink = d.n % 6 < 3
  const parts: RenderChildren[] = []
  plan.steps.forEach((s, i) => {
    parts.push(node(Text, s, i === current, blink), segment(Text, s, tl.spans[i]!, gaps[i] ?? 0, d))
  })
  parts.push(<Text bold color={tl.isEndReal ? OK : ACC}>⚑</Text>)
  const rail = <Text wrap="truncate-end">{parts}</Text>
  if (!labels) return rail

  const ids: Tag[] = plan.steps.map((s, i) => ({
    col: cols[i]! + Math.max(0, Math.floor((1 + (gaps[i] ?? 0) - s.id.length) / 2)),
    text: s.id,
    color: idColor(s, i === current),
    bold: i === current,
  }))
  const hours: Tag[] = plan.steps.map((_, i) => {
    const span = tl.spans[i]!
    const isCur = i === current
    const color = isCur ? ACC : span.isStartReal ? WH : DM
    return { col: cols[i]!, text: `${span.isStartReal ? '' : '~'}${fmtClock(span.start, d.tz)}`, color, bold: isCur }
  })
  const endHour: Tag = { col: 0, right: true, text: `${tl.isEndReal ? '' : '~'}${fmtClock(tl.end, d.tz)}`, color: tl.isEndReal ? OK : ACC, bold: true }
  const endId: Tag = { col: 0, right: true, text: 'fin', color: DM }
  // The current step first, then the end, then the others: what does not fit gives way.
  const order = (xs: Tag[], end: Tag) => (current >= 0 ? [xs[current]!, end, ...xs.filter((_, k) => k !== current)] : [end, ...xs])
  return (
    <Box flexDirection="column">
      <Tags T={Text} tags={placeLabels(width, order(ids, endId))} />
      {rail}
      <Tags T={Text} tags={placeLabels(width, order(hours, endHour))} />
    </Box>
  )
}

function idColor(s: Step, isCurrent: boolean): string {
  if (isCurrent) return ACC
  if (s.status === 'completed') return OK
  if (s.status === 'skipped') return FA
  return DM
}

/** A step's stretch of the track: lit when done, filling while it runs, coral past its estimate, amber while it waits. */
function segment(T: T, s: Step, span: Span, g: number, d: ViewData) {
  if (g <= 0) return null
  if (s.status === 'completed') return <T color={OK}>{'━'.repeat(g)}</T>
  if (s.status === 'skipped') return <T color={FA}>{'┄'.repeat(g)}</T>
  if (s.status === 'pending') return <T color={TRACK}>{'━'.repeat(g)}</T>
  const len = span.end - span.start
  const filled = Math.max(1, Math.round((len > 0 ? Math.min(1, (d.now - span.start) / len) : 1) * g))
  const isOver = s.estimateMin !== undefined && d.now - span.start > s.estimateMin * MIN
  const base = s.status === 'blocked' ? WARN : isOver ? HOT : ACC
  const spark = d.n % (filled + 3)
  const out: RenderChildren[] = []
  for (let k = 0; k < filled; k++) out.push(<T bold={k === spark} color={k === spark ? WH : base}>━</T>)
  out.push(<T color={TRACK}>{'━'.repeat(g - filled)}</T>)
  return out
}

function node(T: T, s: Step, isCurrent: boolean, blink: boolean) {
  switch (s.status) {
    case 'completed': return <T bold color={OK}>●</T>
    case 'skipped': return <T color={FA}>⊘</T>
    case 'blocked': return <T bold color={blink ? WARN : WH}>{WAIT}</T>
    case 'in_progress': return <T bold color={blink ? ACC : WH}>◉</T>
    default: return <T color={isCurrent ? ACC : DM}>○</T>
  }
}

/** The running step's bar: a sweep of light while it runs, coral past its estimate. */
function StepBar({ T, s, now, n, width }: { T: T; s: Step; now: number; n: number; width: number }) {
  const el = stepElapsed(s, now)
  const w = Math.max(6, width)
  if (s.estimateMin === undefined) {
    const pos = n % (w + 4)
    const out: RenderChildren[] = []
    for (let i = 0; i < w; i++) out.push(<T color={i >= pos - 3 && i <= pos ? ACC : TRACK}>▰</T>)
    return <T wrap="truncate-end">{out}<T color={DM}>  sans estimation</T></T>
  }
  const ratio = el / (s.estimateMin * MIN)
  if (ratio <= 1) {
    const filled = Math.max(1, Math.round(ratio * w))
    const sweep = n % (filled + 8)
    const a = Math.min(filled, Math.max(0, sweep - 1))
    const b = Math.min(filled, sweep + 1)
    return (
      <T wrap="truncate-end">
        <T color={ACC}>{'▰'.repeat(a)}</T><T bold color={WH}>{'▰'.repeat(b - a)}</T><T color={ACC}>{'▰'.repeat(filled - b)}</T>
        <T color={TRACK}>{'▰'.repeat(w - filled)}</T>
        <T bold color={ACC}>{`  ${Math.min(99, Math.round(ratio * 100))} %`}</T>
      </T>
    )
  }
  const mark = Math.max(1, Math.min(w - 2, Math.floor(w / ratio)))
  const sweep = n % (w + 8)
  const cells = (from: number, to: number, base: string) => {
    const out: RenderChildren[] = []
    for (let i = from; i < to; i++) out.push(<T bold={i === sweep} color={i === sweep ? WH : base}>▰</T>)
    return out
  }
  return (
    <T wrap="truncate-end">
      {cells(0, mark, ACC)}<T bold color={WH}>│</T>{cells(mark + 1, w, HOT)}
      <T bold color={HOT}>{`  +${Math.round((ratio - 1) * 100)} %`}</T>
    </T>
  )
}

function stepTime(T: T, s: Step, now: number) {
  const est = s.estimateMin === undefined ? undefined : s.estimateMin * MIN
  if (s.status === 'pending') return <T color={DM}>{`~${fmtEstimate(s.estimateMin)}`}</T>
  if (s.status === 'skipped') return <T color={FA}>—</T>
  const el = stepElapsed(s, now)
  // Closed unopened: its time runs from the step before's end, a guess shown as one.
  if (s.untimed) return <T><T color={WH}>{`≈ ${fmtDur(el)}`}</T><T color={DM}>{` / ${fmtEstimate(s.estimateMin)}`}</T></T>
  const isOver = est !== undefined && el > est * 1.05
  const isRunning = s.status === 'in_progress' || s.status === 'blocked'
  return (
    <T>
      <T bold={isRunning} color={isOver ? HOT : isRunning ? ACC : WH}>{fmtDur(el)}</T>
      <T color={DM}>{` / ${isRunning ? '~' : ''}${fmtEstimate(s.estimateMin)}`}</T>
    </T>
  )
}

function stepIcon(T: T, s: Step, n: number) {
  switch (s.status) {
    case 'completed': return <T color={OK}>✓</T>
    case 'skipped': return <T color={FA}>⊘</T>
    case 'blocked': return <T bold color={WARN}>{WAIT}</T>
    case 'in_progress': return <T bold color={ACC}>{SPINNER[n % SPINNER.length]}</T>
    default: return <T color={DM}>○</T>
  }
}

/** One row of the list: what it is on the left, its time on the right, never wrapped. */
function StepRow({ E, s, d }: { E: Els; s: Step; d: ViewData }) {
  const { Box, Text } = E
  const tint = s.status === 'pending' ? DM : s.status === 'skipped' ? FA : WH
  return (
    <Box justifyContent="space-between">
      <Text wrap="truncate-end">{stepIcon(Text, s, d.n)} <Text color={FA}>{s.id.padStart(2)}</Text> <Text color={tint} strikethrough={s.status === 'skipped'}>{s.title}</Text></Text>
      <Box flexShrink={0} marginLeft={1}>{stepTime(Text, s, d.now)}</Box>
    </Box>
  )
}

function Tile({ E, label, value, color, sub, aside, width }: { E: Els; label: string; value: string; color: string; sub?: RenderChildren; aside?: string; width?: number }) {
  const { Box, Text } = E
  return (
    <Box flexGrow={width === undefined ? 1 : 0} width={width} flexDirection="column" borderStyle="round" borderColor={FA} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color={DM}>{label}</Text>
        {aside !== undefined && <Box flexShrink={0} marginLeft={1}><Text color={DM}>{aside}</Text></Box>}
      </Box>
      <Text bold color={color} wrap="truncate-end">{value}</Text>
      {sub !== undefined && <Text color={DM} wrap="truncate-end">{sub}</Text>}
    </Box>
  )
}

/** The session in three tiles: how long, how much, how many tokens sent and received. */
function SessionTiles({ E, d, width }: { E: Els; d: ViewData; width: number }) {
  const { Box, Text } = E
  const a = d.activity
  const t = a.tokens
  const w = Math.min(16, Math.floor((width - 2) / 3))
  return (
    <Box gap={1}>
      <Tile E={E} label="DURÉE" value={a.startedAt ? fmtDur(d.now - a.startedAt) : '—'} width={w} color={WH} sub={a.startedAt ? `depuis ${fmtClock(a.startedAt, d.tz)}` : undefined} />
      <Tile E={E} label="COÛT ≈" value={a.costUsd === undefined ? '—' : dollars(a.costUsd)} width={w} color={WARN} sub="au tarif API" />
      <Tile
        E={E} label="TOKENS" value={t ? fmtTokens(tokenShares(t).total) : '—'} width={width - 2 * w - 2} color={ACC}
        aside={t ? `${t.requests} req.` : undefined}
        sub={t ? <Text><Text color={ACC}>↑</Text><Text color={WH}> {fmtTokens(tokenShares(t).sent)}</Text><Text color={WARN}>  ↓</Text><Text color={WH}> {fmtTokens(t.output)}</Text></Text> : 'aucune requête'}
      />
    </Box>
  )
}

/** What the prompt cache served of what was sent, in one quiet line. */
function Cache({ E, d }: { E: Els; d: ViewData }) {
  const { Box, Text } = E
  const t = d.activity.tokens
  const sh = t && tokenShares(t)
  // A cache read costs a tenth of fresh input: the higher the share, the cheaper each turn.
  return (
    <Box justifyContent="space-between">
      <Text bold color={DM}>CACHE</Text>
      <Box flexShrink={1} marginLeft={1}>
        {sh && sh.sent > 0
          ? <Text wrap="truncate-end"><Text bold color={sh.readPct < 50 ? WARN : ACC}>{Math.round(sh.readPct)} %</Text><Text color={DM}> relus du cache, ≈ 10× moins chers</Text></Text>
          : <Text color={DM}>pas encore de requête</Text>}
      </Box>
    </Box>
  )
}

// ── The side panel ─────────────────────────────────────────────────────────

/** The dock's width while the person drags it: ✓ on the width aimed at, else the way to it. */
function Width({ T, cols, target }: { T: T; cols: number; target: number }) {
  if (cols === target) return <T><T bold color={OK}>↔ {cols} col ✓</T></T>
  const gap = target - cols
  return <T><T bold color={ACC}>↔ {cols} col</T><T color={DM}>  {gap > 0 ? '+' : '−'}{Math.abs(gap)} → {target}</T></T>
}

export function Dock({ E, d }: { E: Els; d: ViewData }) {
  const { Box, Text } = E
  const W = Math.max(30, d.cols - 2 * PAD_X)
  const a = d.activity
  const live = d.working ? (d.n % 8 < 4 ? ACC : DM) : DM
  return (
    <Box flexDirection="column" minHeight={Math.max(1, d.rows)} paddingX={PAD_X} paddingTop={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text><Text bold color={ACC}>◢◤ {spaced('COCKPIT')}</Text><Text color={FA}>  v{VERSION}</Text>{a.latest ? <Text color={WARN}> → v{a.latest}</Text> : null}</Text>
        <Box flexShrink={0}>
          {d.resize
            ? <Width T={Text} cols={d.cols} target={d.resize.target} />
            : <Text><Text color={DM}>{fmtClock(d.now, d.tz, true)}  </Text><Text color={live}>●</Text><Text bold color={d.working ? ACC : DM}>{d.working ? ' LIVE' : ' VEILLE'}</Text></Text>}
        </Box>
      </Box>

      <Heading E={E} title="CONFIGURATION" width={W} fold={fold(d, 'config')} />
      {!fold(d, 'config').isOpen ? <ConfigLine E={E} d={d} /> : <Box flexDirection="column" gap={1} marginTop={1}>
        <Box gap={1}>
          <Box flexGrow={1} flexDirection="column" borderStyle="round" borderColor={FA} paddingX={1}>
            <Text bold color={DM}>MODÈLE</Text>
            <Text bold color={WH} wrap="truncate-end">◆ {prettyModel(a.model)}</Text>
            <Text color={DM} wrap="truncate-end">{a.model ?? '—'} · {fmtTokens(a.contextWindow)}</Text>
          </Box>
          <Box width={19} flexDirection="column" borderStyle="round" borderColor={FA} paddingX={1}>
            <Text bold color={DM}>MODE</Text>
            <Chip T={Text} mode={a.mode} />
            <Text color={DM}>shift+tab</Text>
          </Box>
        </Box>
        <Box justifyContent="space-between">
          <Text bold color={DM}>EFFORT</Text>
          <Effort T={Text} effort={a.effort} />
        </Box>
      </Box>}

      <Box marginTop={1}><Heading E={E} title="STATISTIQUES" width={W} fold={fold(d, 'stats')} /></Box>
      {!fold(d, 'stats').isOpen ? <StatsLine E={E} d={d} /> : <Box marginTop={1}><SessionTiles E={E} d={d} width={W} /></Box>}

      <Box marginTop={1}><Heading E={E} title="ACTIVITÉ" width={W} fold={fold(d, 'activity')} /></Box>
      {!fold(d, 'activity').isOpen ? <ActivityLine E={E} d={d} /> : <Box flexDirection="column" gap={1} marginTop={1}>
        <Box flexDirection="column">
          <Gauge E={E} n={d.n} label="SESSION · 5 H" pct={used(d, 'five_hour')} width={W} info={resetInfo(d, 'five_hour', 'fin de fenêtre dans')} />
          <Pace E={E} d={d} />
        </Box>
        <Gauge E={E} n={d.n} label="SEMAINE" pct={used(d, 'seven_day')} width={W} info={resetInfo(d, 'seven_day', 'renouvellement dans')} />
        <Context E={E} d={d} width={W} />
        <Flow E={E} d={d} width={W} />
        <Cache E={E} d={d} />
        {d.bg.length > 0 && <Background E={E} d={d} />}
      </Box>}

      {hasPlan(d) && (
        <Box marginTop={1} flexGrow={d.board ? 0 : 1}>
          <DockPlan E={E} d={d} plan={d.plan} W={W} />
        </Box>
      )}
      {d.board && (
        <Box marginTop={1} flexGrow={1}>
          <DockBoard E={E} d={d} board={d.board} W={W} />
        </Box>
      )}
    </Box>
  )
}

/** What is left of the plan: `fini`, or the time, `+?` when a step has no estimate. */
function remaining(t: Totals, allDone: boolean): string {
  if (allDone) return 'fini'
  return `${fmtDur(t.remainingMs)}${t.hasUnknown ? ' +?' : ''}`
}

/** A finished plan stays on screen this long, then gives way to the history. */
const FADE_MS = 10 * MIN

function isFaded(plan: Plan, now: number) {
  return plan.finishedAt !== undefined && now - plan.finishedAt > FADE_MS
}

/** The plan section shows only while a plan runs, or for a while once it is done. */
function hasPlan(d: ViewData): d is ViewData & { plan: Plan } {
  return d.plan !== null && !isFaded(d.plan, d.now)
}

/** The work the session left running: shells, subagents, monitors. */
function Background({ E, d }: { E: Els; d: ViewData }) {
  const { Box, Text } = E
  const count = (kind: BgTask['kind']) => d.bg.filter(t => t.kind === kind).length
  const parts = [
    count('agent') && `${count('agent')} agent${count('agent') > 1 ? 's' : ''}`,
    count('shell') && `${count('shell')} commande${count('shell') > 1 ? 's' : ''}`,
    count('other') && `${count('other')} autre${count('other') > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ')
  const shown = [...d.bg].sort((a, b) => a.startedAt - b.startedAt).slice(0, 3)
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color={DM}>EN FOND</Text>
        <Text color={WH}>{parts}</Text>
      </Box>
      {shown.map(t => (
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text color={ACC}>{SPINNER[(d.n + t.startedAt) % SPINNER.length]}</Text>
            <Text color={DM}>{` ${t.kind === 'agent' ? 'agent' : t.kind === 'shell' ? 'shell' : 'tâche'}  `}</Text>
            <Text color={WH}>{t.label}</Text>
          </Text>
          <Box flexShrink={0} marginLeft={1}><Text color={DM}>{fmtDur(d.now - t.startedAt)}</Text></Box>
        </Box>
      ))}
      {d.bg.length > shown.length && <Text color={DM}>{`  … et ${d.bg.length - shown.length} de plus`}</Text>}
    </Box>
  )
}

const MAX_DONE_SHOWN = 4

function DockPlan({ E, d, plan, W }: { E: Els; d: ViewData; plan: Plan; W: number }) {
  const { Box, Text } = E
  const t = totals(plan, d.now)
  const doneIdx = plan.steps.map((s, i) => (s.status === 'completed' || s.status === 'skipped' ? i : -1)).filter(i => i >= 0 && i < (t.current < 0 ? Infinity : t.current))
  const hidden = doneIdx.length > MAX_DONE_SHOWN ? doneIdx.slice(0, doneIdx.length - MAX_DONE_SHOWN) : []
  // A step closed unopened counts its guessed time, and makes the sum a guess.
  const folded = hidden.map(i => plan.steps[i]!)
  const hiddenMs = folded.reduce((sum, s) => sum + stepElapsed(s, d.now), 0)
  const isGuess = folded.some(s => s.untimed)
  const allDone = t.done === t.total && t.total > 0
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Heading E={E} title="PLAN" width={W} fold={fold(d, 'plan')} right={<Text><Text bold color={allDone ? OK : ACC}>{t.done}</Text><Text color={DM}> / {t.total}</Text></Text>} />
      {!fold(d, 'plan').isOpen ? <PlanLine E={E} d={d} plan={plan} /> : <Box flexDirection="column" marginTop={1} flexGrow={1}>
        <Text bold color={WH} wrap="wrap">{plan.title}</Text>
        <Text>
          <Text color={DM}>écoulé </Text><Text color={WH}>{fmtDur(t.elapsedMs)}</Text>
          <Text color={DM}>  ·  reste ≈ </Text><Text bold color={ACC}>{remaining(t, allDone)}</Text>
        </Text>
        <Rail E={E} plan={plan} d={d} width={W} current={t.current} labels />
        <Box flexDirection="column" marginTop={1}>
          {hidden.length > 0 && (
            <Box justifyContent="space-between">
              <Text color={DM}><Text color={ACC}>✓</Text>  … {hidden.length} étapes faites</Text>
              <Box flexShrink={0}><Text color={DM}>{`${isGuess ? '≈ ' : ''}${fmtDur(hiddenMs)}`}</Text></Box>
            </Box>
          )}
          {plan.steps.map((s, i) => {
            if (hidden.includes(i)) return null
            if (s.status === 'in_progress' || s.status === 'blocked') return <Current E={E} d={d} s={s} i={i} W={W} />
            return <StepRow E={E} s={s} d={d} />
          })}
        </Box>
        <Box flexGrow={1} minHeight={1} />
        {plan.steps.some(s => s.untimed) && <Text color={DM} wrap="truncate-end">≈ : étape close sans avoir été ouverte, temps compté depuis la précédente</Text>}
      </Box>}
    </Box>
  )
}

// ── What a folded section keeps: one line ────────────────────────────────

function ConfigLine({ E, d }: { E: Els; d: ViewData }) {
  const { Text } = E
  const a = d.activity
  return (
    <Text wrap="truncate-end">
      <Text bold color={WH}>◆ {prettyModel(a.model)}</Text><Text color={DM}>  ·  </Text><Chip T={Text} mode={a.mode} />
      <Text color={DM}>  ·  effort </Text><Text bold color={WH}>{a.effort ?? '—'}</Text>
    </Text>
  )
}

/** Folded, the statistics keep their figures on one line. */
function StatsLine({ E, d }: { E: Els; d: ViewData }) {
  const { Text } = E
  const a = d.activity
  const t = a.tokens
  const sh = t && tokenShares(t)
  return (
    <Text wrap="truncate-end">
      <Text color={WH}>{a.startedAt ? fmtDur(d.now - a.startedAt) : '—'}</Text>
      <Text color={DM}>  ·  </Text><Text color={WARN}>{a.costUsd === undefined ? '—' : `≈ ${dollars(a.costUsd)}`}</Text>
      <Text color={DM}>  ·  </Text><Text color={ACC}>{fmtTokens(sh?.total)}</Text><Text color={DM}> tokens</Text>
      {t && sh && <Text><Text color={DM}> (</Text><Text color={ACC}>↑</Text><Text color={WH}>{fmtTokens(sh.sent)}</Text><Text color={WARN}> ↓</Text><Text color={WH}>{fmtTokens(t.output)}</Text><Text color={DM}>)</Text></Text>}
    </Text>
  )
}

/** Folded, the activity keeps the 5-hour window: how full, when it ends, where the pace takes it. */
function ActivityLine({ E, d }: { E: Els; d: ViewData }) {
  const { Box, Text } = E
  const pct = used(d, 'five_hour')
  const t = tone(pct)
  const l = limit(d.activity, 'five_hour')
  const at = l?.resetsAt ? Date.parse(l.resetsAt) : undefined
  const pace = paceOf(d)
  return (
    <Box justifyContent="space-between">
      <Text wrap="truncate-end">
        <Text bold color={DM}>5 H </Text>
        <Text bold color={t === 'hot' && d.n % 8 >= 4 ? DM : TONE[t]}>{pct === undefined ? '—' : `${Math.round(pct)} %`}</Text>
        {at !== undefined && at > d.now && <Text><Text color={DM}> · fin </Text><Text color={WH}>{fmtClock(at, d.tz)}</Text><Text color={DM}>{` (${fmtDur(at - d.now)})`}</Text></Text>}
      </Text>
      {pace && <Box flexShrink={0} marginLeft={1}><Text bold color={pace.color}>{pace.text}</Text></Box>}
    </Box>
  )
}

function PlanLine({ E, d, plan }: { E: Els; d: ViewData; plan: Plan }) {
  const { Box, Text } = E
  const t = totals(plan, d.now)
  const allDone = t.done === t.total && t.total > 0
  const cur = t.current >= 0 ? plan.steps[t.current] : undefined
  return (
    <Box justifyContent="space-between">
      <Text wrap="truncate-end">
        {cur && <Text>{stepIcon(Text, cur, d.n)} </Text>}
        {!cur && allDone && <Text color={OK}>✓ </Text>}
        <Text bold color={WH}>{plan.title}</Text>
        {cur && <Text color={DM}>{` · ${cur.id} ${cur.title}`}</Text>}
      </Text>
      <Box flexShrink={0} marginLeft={1}>
        <Text>
          <Text color={DM}>reste ≈ </Text><Text bold color={ACC}>{remaining(t, allDone)}</Text>
          <Text color={DM}> · fin </Text><Text bold color={allDone ? OK : ACC}>{`${allDone ? '' : '~'}${fmtClock(timeline(plan, d.now).end, d.tz)}`}</Text>
        </Text>
      </Box>
    </Box>
  )
}

function Current({ E, d, s, i, W }: { E: Els; d: ViewData; s: Step; i: number; W: number }) {
  const { Box, Text } = E
  const isBlocked = s.status === 'blocked'
  const frame = isBlocked ? WARN : ACC
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={frame} paddingX={1} key={`cur-${i}`}>
      <Box justifyContent="space-between">
        <Text wrap="truncate-end">{stepIcon(Text, s, d.n)} <Text bold color={frame}>{s.id}</Text> <Text bold color={WH}>{s.title}</Text></Text>
        <Box flexShrink={0} marginLeft={1}>{stepTime(Text, s, d.now)}</Box>
      </Box>
      {isBlocked
        ? <Text bold color={d.n % 8 < 4 ? WARN : DM}>attend une décision de l'opérateur</Text>
        : <StepBar T={Text} s={s} now={d.now} n={d.n} width={W - 12} />}
      {(s.done ?? []).map(note => <Text wrap="truncate-end"><Text color={ACC}>✓</Text> <Text color={DM}>{note}</Text></Text>)}
      {s.note && <Text wrap="truncate-end"><Text bold color={ACC}>›</Text> <Text color={WH}>{s.note}</Text></Text>}
    </Box>
  )
}

// ── The session space: what the session shows besides its plan ────────────

const BOARD_TONE: Record<BoardTone, string> = { ok: OK, warn: WARN, hot: HOT }
/** Closed items kept in sight; the older ones fold into one line. */
const MAX_CLOSED_SHOWN = 3
const LOG_SHOWN = 4

function itemIcon(T: T, s: BoardItem, n: number) {
  switch (s.status) {
    case 'completed': return <T color={OK}>✓</T>
    case 'failed': return <T bold color={HOT}>✗</T>
    case 'skipped': return <T color={FA}>⊘</T>
    case 'blocked': return <T bold color={WARN}>{WAIT}</T>
    case 'in_progress': return <T bold color={SP}>{SPINNER[n % SPINNER.length]}</T>
    default: return <T color={DM}>○</T>
  }
}

/** Pieces of one line, a dim ` · ` between them; none when there are none. */
function dotted(T: T, pieces: readonly RenderChildren[]): RenderChildren[] {
  return pieces.flatMap((p, i) => (i === 0 ? [p] : [<T color={DM}> · </T>, p]))
}

/** What runs, waits or failed, in a few signs: `◉ 2 · ⏸ 1 · ✗ 1`. */
function countsText(T: T, c: BoardCounts) {
  const signs: [number, string, string][] = [[c.in_progress, '◉', SP], [c.blocked, WAIT, WARN], [c.failed, '✗', HOT]]
  return dotted(T, signs.filter(([n]) => n > 0).map(([n, sign, color]) => <T bold color={color}>{`${sign} ${n}`}</T>))
}

/** The key figures, `label value` each, in their tone. */
function Metrics({ T, board }: { T: T; board: Board }) {
  return (
    <T wrap="wrap">
      {board.metrics.map((m, i) => (
        <T>{i > 0 && <T color={FA}>  ·  </T>}<T color={DM}>{m.label} </T><T bold color={m.tone ? BOARD_TONE[m.tone] : WH}>{m.value}</T></T>
      ))}
    </T>
  )
}

/** The items as one gauge: done, failed, running, waiting, then what is still to come. */
function BoardBar({ T, c, width }: { T: T; c: BoardCounts; width: number }) {
  const runs: [number, string, string][] = [
    [c.completed, '█', OK], [c.failed, '█', HOT], [c.in_progress, '█', SP], [c.blocked, '█', WARN], [c.pending, EMPTY, EMPTY_TONE],
  ]
  const cells = apportion(runs.map(r => r[0]), width, 0)
  return <T wrap="truncate-end">{runs.map((r, i) => <T color={r[2]}>{r[1].repeat(cells[i] ?? 0)}</T>)}</T>
}

/** What sits right of an item: who does it, how far, how long. */
function itemAside(T: T, s: BoardItem, now: number) {
  const isRunning = s.status === 'in_progress' || s.status === 'blocked'
  const pieces: RenderChildren[] = []
  if (s.owner) pieces.push(<T color={DM}>{s.owner}</T>)
  if (s.progress !== undefined && !isItemClosed(s.status)) pieces.push(<T bold color={SP}>{`${s.progress} %`}</T>)
  if (s.startedAt !== undefined) pieces.push(<T bold={isRunning} color={isRunning ? SP : DM}>{fmtDur((s.endedAt ?? now) - s.startedAt)}</T>)
  return dotted(T, pieces)
}

function BoardRow({ E, s, d }: { E: Els; s: BoardItem; d: ViewData }) {
  const { Box, Text } = E
  const tint = s.status === 'pending' ? DM : s.status === 'skipped' ? FA : WH
  const noteColor = s.status === 'failed' ? HOT : s.status === 'blocked' ? WARN : WH
  const aside = itemAside(Text, s, d.now)
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text wrap="truncate-end">
          {itemIcon(Text, s, d.n)} <Text color={FA}>{s.id}</Text>
          {s.title !== s.id && <Text bold={s.status === 'in_progress'} color={tint} strikethrough={s.status === 'skipped'}> {s.title}</Text>}
        </Text>
        {aside.length > 0 && <Box flexShrink={0} marginLeft={1}><Text>{aside}</Text></Box>}
      </Box>
      {s.note && (!isItemClosed(s.status) || s.status === 'failed') && (
        <Text wrap="truncate-end"><Text color={DM}>   › </Text><Text color={noteColor}>{s.note}</Text></Text>
      )}
    </Box>
  )
}

function DockBoard({ E, d, board, W }: { E: Els; d: ViewData; board: Board; W: number }) {
  const { Box, Text } = E
  const c = boardCounts(board)
  const f = fold(d, 'board')
  // A failure stays in sight; the other closed items give way past the last few.
  const closedIdx = board.items.flatMap((s, i) => (s.status === 'completed' || s.status === 'skipped' ? [i] : []))
  const hidden = closedIdx.slice(0, Math.max(0, closedIdx.length - MAX_CLOSED_SHOWN))
  const allDone = c.total > 0 && c.completed === c.total
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Heading
        E={E} title="ESPACE SESSION" width={W} fold={f} color={SP}
        right={c.total > 0 ? <Text><Text bold color={allDone ? OK : SP}>{c.completed}</Text><Text color={DM}> / {c.total}</Text></Text> : undefined}
      />
      {!f.isOpen ? <BoardLine E={E} d={d} board={board} c={c} /> : <Box flexDirection="column" marginTop={1}>
        <Box justifyContent="space-between">
          <Text bold color={WH} wrap="truncate-end">{board.title}</Text>
          <Box flexShrink={0} marginLeft={1}><Text color={DM}>{`maj ${fmtClock(board.updatedAt, d.tz)}`}</Text></Box>
        </Box>
        {c.total > 0 && <BoardBar T={Text} c={c} width={W} />}
        {board.metrics.length > 0 && <Metrics T={Text} board={board} />}
        {board.items.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {hidden.length > 0 && <Text color={DM}><Text color={OK}>✓</Text>  … {hidden.length} entrées closes</Text>}
            {board.items.map((s, i) => (hidden.includes(i) ? null : <BoardRow E={E} s={s} d={d} />))}
          </Box>
        )}
        {board.log.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color={DM}>JOURNAL</Text>
            {board.log.slice(-LOG_SHOWN).map(l => (
              <Text wrap="truncate-end"><Text color={DM}>{fmtClock(l.at, d.tz)}  </Text><Text color={l.tone ? BOARD_TONE[l.tone] : WH}>{l.text}</Text></Text>
            ))}
          </Box>
        )}
      </Box>}
    </Box>
  )
}

/** Folded, the session space keeps its title and what runs, waits or failed. */
function BoardLine({ E, d, board, c }: { E: Els; d: ViewData; board: Board; c: BoardCounts }) {
  const { Box, Text } = E
  const counts = countsText(Text, c)
  const last = board.log.at(-1)
  return (
    <Box justifyContent="space-between">
      <Text wrap="truncate-end">
        <Text bold color={WH}>{board.title}</Text>
        {counts.length > 0 && <Text color={DM}>  ·  </Text>}
        {counts}
        {counts.length === 0 && last && <Text color={DM}>{`  ·  ${last.text}`}</Text>}
      </Text>
      <Box flexShrink={0} marginLeft={1}><Text color={DM}>{`maj ${fmtClock(board.updatedAt, d.tz)}`}</Text></Box>
    </Box>
  )
}

// ── The band above the prompt ──────────────────────────────────────────────

export function Band({ E, d }: { E: Els; d: ViewData }) {
  const { Box, Text } = E
  const W = Math.max(60, d.cols - 2 * PAD_X)
  const a = d.activity
  const colW = Math.floor((W - 6) / 3)
  const live = d.working ? (d.n % 8 < 4 ? ACC : DM) : DM
  return (
    <Box flexDirection="column" gap={1} paddingX={PAD_X}>
      <Box justifyContent="space-between">
        <Text><Text bold color={ACC}>◢◤ {spaced('COCKPIT')}</Text><Text color={FA}>  v{VERSION}</Text>{a.latest ? <Text color={WARN}> → v{a.latest}</Text> : null}</Text>
        <Box flexShrink={0}>
          <Text>
            <Text bold color={WH}>◆ {prettyModel(a.model)}</Text>
            <Text color={DM}>   effort </Text><Effort T={Text} effort={a.effort} />
            <Text>   </Text><Chip T={Text} mode={a.mode} />
            <Text color={DM}>   {fmtClock(d.now, d.tz, true)} </Text><Text color={live}>●</Text>
          </Text>
        </Box>
      </Box>
      <Box gap={3}>
        <Box width={colW} flexDirection="column"><Gauge E={E} n={d.n} label="SESSION · 5 H" pct={used(d, 'five_hour')} width={colW} info={resetInfo(d, 'five_hour', 'fin dans')} /><Pace E={E} d={d} /></Box>
        <Box width={colW}><Gauge E={E} n={d.n} label="SEMAINE" pct={used(d, 'seven_day')} width={colW} info={resetInfo(d, 'seven_day', 'renouvellement')} /></Box>
        <Box width={colW} flexDirection="column"><Context E={E} d={d} width={colW} /></Box>
      </Box>
      <BandActivity E={E} d={d} />
      {d.bg.length > 0 && <BandBackground E={E} d={d} />}
      {hasPlan(d) && <BandPlan E={E} d={d} plan={d.plan} W={W} />}
      {d.board && <BandBoard E={E} d={d} board={d.board} />}
    </Box>
  )
}

function BandPlan({ E, d, plan, W }: { E: Els; d: ViewData; plan: Plan; W: number }) {
  const { Box, Text } = E
  const t = totals(plan, d.now)
  const allDone = t.done === t.total && t.total > 0
  const count = plan.steps.length
  const colW = Math.floor((W - (count - 1)) / Math.max(1, count))
  const isColumns = colW >= 14
  const cur = t.current >= 0 ? plan.steps[t.current] : undefined
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text wrap="truncate-end"><Text bold color={DM}>{spaced('PLAN')}  </Text><Text bold color={WH}>{plan.title}  </Text><Text bold color={allDone ? OK : ACC}>{t.done}</Text><Text color={DM}>/{t.total}</Text></Text>
        <Box flexShrink={0}>
          <Text>
            <Text color={DM}>écoulé </Text><Text bold color={WH}>{fmtDur(t.elapsedMs)}</Text>
            <Text color={DM}>  ·  reste ≈ </Text><Text bold color={ACC}>{remaining(t, allDone)}</Text>
            <Text color={DM}>  ·  fin ≈ </Text><Text bold color={ACC}>{allDone ? '✓' : fmtClock(d.now + t.remainingMs, d.tz)}</Text>
          </Text>
        </Box>
      </Box>
      {isColumns ? (
        <Box gap={1}>
          {plan.steps.map((s, i) => {
            const isCur = i === t.current
            const fill = colW - 1
            return (
              <Box width={colW} flexDirection="column">
                <Text wrap="truncate-end">
                  {node(Text, s, isCur, d.n % 6 < 3)}
                  {isCur && s.status === 'in_progress'
                    ? <BandSweep T={Text} s={s} now={d.now} n={d.n} width={fill} />
                    : <Text color={s.status === 'completed' ? OK : TRACK}>{'━'.repeat(fill)}</Text>}
                </Text>
                <Text wrap="truncate-end">{isCur ? stepIcon(Text, s, d.n) : <Text color={FA}>{s.id}</Text>} <Text bold={isCur} color={isCur ? WH : s.status === 'pending' ? DM : WH}>{s.title}</Text></Text>
                <Text wrap="truncate-end">{stepTime(Text, s, d.now)}</Text>
              </Box>
            )
          })}
        </Box>
      ) : (
        <Rail E={E} plan={plan} d={d} width={W} current={t.current} />
      )}
      {cur && (
        <Text wrap="truncate-end">
          <Text bold color={cur.status === 'blocked' ? WARN : ACC}>› </Text>
          {!isColumns && <Text bold color={WH}>{cur.id} {cur.title}  </Text>}
          {cur.status === 'blocked' ? <Text bold color={WARN}>{WAIT} attend une décision de l'opérateur</Text> : <Text color={WH}>{cur.note ?? ''}</Text>}
          {(() => {
            const next = plan.steps.slice(t.current + 1).find(s => s.status === 'pending')
            return next ? <Text color={DM}>{`   ·   ensuite : ${next.title}`}</Text> : null
          })()}
        </Text>
      )}
    </Box>
  )
}

function BandActivity({ E, d }: { E: Els; d: ViewData }) {
  const { Box, Text } = E
  const a = d.activity
  const t = a.tokens
  const sh = t && tokenShares(t)
  return (
    <Box justifyContent="space-between">
      <Text wrap="truncate-end">
        <Text bold color={DM}>{spaced('ACTIVITÉ')}  </Text>
        <Text bold color={WH}>{a.startedAt ? fmtDur(d.now - a.startedAt) : '—'}</Text>
        <Text color={DM}>  ·  </Text><Text bold color={WARN}>{money(a.costUsd)}</Text>
        <Text color={DM}>  ·  </Text><Text bold color={ACC}>{fmtTokens(sh?.total)}</Text><Text color={DM}> tokens</Text>
        {t && sh && (
          <Text>
            <Text color={ACC}>  ↑</Text><Text color={WH}> {fmtTokens(sh.sent)}</Text><Text color={WARN}>  ↓</Text><Text color={WH}> {fmtTokens(t.output)}</Text>
            <Text color={DM}>{`  ·  ${t.requests} req.`}</Text>
          </Text>
        )}
      </Text>
      {t && sh && (
        <Box flexShrink={0} marginLeft={1}>
          <Text>
            <Text color={DM}>relus du cache </Text><Text color={WH}>{Math.round(sh.readPct)} %</Text><Text color={DM}> des envoyés</Text>
          </Text>
        </Box>
      )}
    </Box>
  )
}

function BandBackground({ E, d }: { E: Els; d: ViewData }) {
  const { Text } = E
  const oldest = [...d.bg].sort((a, b) => a.startedAt - b.startedAt)
  return (
    <Text wrap="truncate-end">
      <Text bold color={DM}>{spaced('EN FOND')}  </Text>
      {oldest.map((t, i) => (
        <Text>
          {i > 0 && <Text color={DM}>   ·   </Text>}
          <Text color={ACC}>{SPINNER[(d.n + t.startedAt) % SPINNER.length]} </Text>
          <Text color={WH}>{t.label}</Text>
          <Text color={DM}>{` ${fmtDur(d.now - t.startedAt)}`}</Text>
        </Text>
      ))}
    </Text>
  )
}

/** The session space in two lines: where it stands and its figures, then its latest log line. */
function BandBoard({ E, d, board }: { E: Els; d: ViewData; board: Board }) {
  const { Box, Text } = E
  const c = boardCounts(board)
  const counts = countsText(Text, c)
  const last = board.log.at(-1)
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text wrap="truncate-end">
          <Text bold color={SP}>{spaced('ESPACE SESSION')}  </Text><Text bold color={WH}>{board.title}  </Text>
          {c.total > 0 && <Text><Text bold color={c.completed === c.total ? OK : SP}>{c.completed}</Text><Text color={DM}>/{c.total}  </Text></Text>}
          {counts}
        </Text>
        {board.metrics.length > 0 && (
          <Box flexShrink={0} marginLeft={1}><Metrics T={Text} board={board} /></Box>
        )}
      </Box>
      {last && (
        <Text wrap="truncate-end"><Text bold color={SP}>› </Text><Text color={DM}>{fmtClock(last.at, d.tz)}  </Text><Text color={last.tone ? BOARD_TONE[last.tone] : WH}>{last.text}</Text></Text>
      )}
    </Box>
  )
}

function BandSweep({ T, s, now, n, width }: { T: T; s: Step; now: number; n: number; width: number }) {
  const ratio = s.estimateMin === undefined ? 0.5 : stepElapsed(s, now) / (s.estimateMin * MIN)
  const filled = Math.max(1, Math.min(width, Math.round(Math.min(1, ratio) * width)))
  const sweep = n % (filled + 6)
  const base = ratio > 1 ? HOT : ACC
  return (
    <T>
      <T color={base}>{'━'.repeat(Math.min(filled, sweep))}</T>
      <T bold color={WH}>{sweep < filled ? '━' : ''}</T>
      <T color={base}>{'━'.repeat(Math.max(0, filled - sweep - 1))}</T>
      <T color={TRACK}>{'━'.repeat(width - filled)}</T>
    </T>
  )
}
