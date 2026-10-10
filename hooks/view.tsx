import type { ElementTable, RenderChildren } from 'claude-code'

import type { Activity, Plan, Step } from '../types'
import {
  bar, fmtClock, fmtDur, fmtEstimate, fmtTokens, fmtWhen, prettyModel, sparkline,
  SPINNER, stepElapsed, tone, totals, wave, MIN,
} from './model'

export type Els = Pick<ElementTable, 'Box' | 'Text'>
type T = Els['Text']

export type ViewData = {
  activity: Activity
  history: readonly number[]
  plan: Plan | null
  n: number
  now: number
  working: boolean
  tz: number
  cols: number
  rows: number
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
const EMPTY = '░'

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
const money = (usd: number | undefined) => (usd === undefined ? '—' : `${usd.toFixed(2).replace('.', ',')} $`)

function limit(a: Activity, kind: string) {
  return a.limits.find(l => l.kind === kind)
}

// ── Pieces both placements share ───────────────────────────────────────────

/** `━━ A C T I V I T É ━━━━━━━━━━━━ right` across the whole width. */
function Heading({ E, title, width, right }: { E: Els; title: string; width: number; right?: RenderChildren }) {
  const { Box, Text } = E
  const label = spaced(title)
  const fill = Math.max(2, width - label.length - 4 - (right ? 8 : 0))
  return (
    <Box justifyContent="space-between">
      <Text wrap="truncate-end"><Text color={FA}>━━ </Text><Text bold color={DM}>{label}</Text><Text color={FA}> {'━'.repeat(fill)}</Text></Text>
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
      <T color={TRACK}>{EMPTY.repeat(b.empty.length)}</T>
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
  return [lead, fmtDur(at - d.now), ` · ${fmtWhen(at, d.now, d.tz)}`]
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
        <Text color={TRACK}>{EMPTY.repeat(free)}</Text><Text color={WARN} dimColor>{'▒'.repeat(buf)}</Text>
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
function Flow({ E, d }: { E: Els; d: ViewData }) {
  const { Box, Text } = E
  const a = d.activity
  const line = sparkline(a.flow, 22)
  const lastOut = a.flow.at(-1)
  return (
    <Box justifyContent="space-between">
      <Text wrap="truncate-end">
        <Text bold color={DM}>DÉBIT  </Text>
        {line
          ? <Text><Text color={ACC}>{line.slice(0, -1)}</Text><Text bold color={d.working && d.n % 6 < 3 ? WH : ACC}>{line.slice(-1)}</Text></Text>
          : <Text color={FA}>{wave(d.n, 12)}</Text>}
        {lastOut !== undefined && <Text color={DM}>  ↓ {fmtTokens(lastOut)}</Text>}
      </Text>
      <Box flexShrink={0} marginLeft={1}>
        <Text><Text color={DM}>session </Text><Text color={WH}>{a.startedAt ? fmtDur(d.now - a.startedAt) : '—'}</Text><Text color={DM}> · </Text><Text color={WH}>{money(a.costUsd)}</Text></Text>
      </Box>
    </Box>
  )
}

/** The rail: one node per step on a solid track, a spark running into the current one. */
function Rail({ T, plan, n, width, current }: { T: T; plan: Plan; n: number; width: number; current: number }) {
  const count = plan.steps.length
  const gap = count > 1 ? Math.max(1, Math.min(10, Math.floor((width - count - 6) / (count - 1)))) : 0
  const blink = n % 6 < 3
  const parts: RenderChildren[] = []
  plan.steps.forEach((s, i) => {
    if (i > 0) {
      if (s.status === 'completed' || s.status === 'skipped') parts.push(<T color={OK}>{'━'.repeat(gap)}</T>)
      else if (i === current) {
        const spark = n % (gap + 3)
        for (let k = 0; k < gap; k++) parts.push(<T bold={k === spark} color={k === spark ? WH : ACC}>━</T>)
      } else parts.push(<T color={TRACK}>{'━'.repeat(gap)}</T>)
    }
    parts.push(node(T, s, i === current, blink))
  })
  return <T wrap="truncate-end">{parts}</T>
}

function node(T: T, s: Step, isCurrent: boolean, blink: boolean) {
  switch (s.status) {
    case 'completed': return <T bold color={OK}>●</T>
    case 'skipped': return <T color={FA}>⊘</T>
    case 'blocked': return <T bold color={blink ? HOT : WH}>✗</T>
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
    case 'blocked': return <T bold color={HOT}>✗</T>
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

function Tile({ E, label, value, color }: { E: Els; label: string; value: string; color: string }) {
  const { Box, Text } = E
  return (
    <Box flexGrow={1} flexDirection="column" borderStyle="round" borderColor={FA} paddingX={1}>
      <Text bold color={DM}>{label}</Text>
      <Text bold color={color} wrap="truncate-end">{value}</Text>
    </Box>
  )
}

// ── The side panel ─────────────────────────────────────────────────────────

export function Dock({ E, d }: { E: Els; d: ViewData }) {
  const { Box, Text } = E
  const W = Math.max(30, d.cols - 2 * PAD_X)
  const a = d.activity
  const live = d.working ? (d.n % 8 < 4 ? ACC : DM) : DM
  return (
    <Box flexDirection="column" minHeight={Math.max(1, d.rows)} paddingX={PAD_X} paddingTop={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={ACC}>◢◤ {spaced('COCKPIT')}</Text>
        <Box flexShrink={0}><Text><Text color={DM}>{fmtClock(d.now, d.tz, true)}  </Text><Text color={live}>●</Text><Text bold color={d.working ? ACC : DM}>{d.working ? ' LIVE' : ' VEILLE'}</Text></Text></Box>
      </Box>

      <Heading E={E} title="ACTIVITÉ" width={W} />
      <Box flexDirection="column" gap={1} marginTop={1}>
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
        <Gauge E={E} n={d.n} label="SESSION · 5 H" pct={limit(a, 'five_hour')?.percentUsed} width={W} info={resetInfo(d, 'five_hour', 'fin de fenêtre dans')} />
        <Gauge E={E} n={d.n} label="SEMAINE" pct={limit(a, 'seven_day')?.percentUsed} width={W} info={resetInfo(d, 'seven_day', 'renouvellement dans')} />
        <Context E={E} d={d} width={W} />
        <Flow E={E} d={d} />
      </Box>

      <Box marginTop={1} flexGrow={1}>
        {d.plan ? <DockPlan E={E} d={d} plan={d.plan} W={W} /> : <Idle E={E} d={d} W={W} />}
      </Box>
    </Box>
  )
}

function Idle({ E, d, W }: { E: Els; d: ViewData; W: number }) {
  const { Box, Text } = E
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Heading E={E} title="PLAN" width={W} />
      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <Text color={ACC}>{wave(d.n, Math.min(32, W))}</Text>
        <Text color={DM}>la frise apparaît dès que Claude déclare un plan</Text>
      </Box>
    </Box>
  )
}

const MAX_DONE_SHOWN = 4

function DockPlan({ E, d, plan, W }: { E: Els; d: ViewData; plan: Plan; W: number }) {
  const { Box, Text } = E
  const t = totals(plan, d.now)
  const doneIdx = plan.steps.map((s, i) => (s.status === 'completed' || s.status === 'skipped' ? i : -1)).filter(i => i >= 0 && i < (t.current < 0 ? Infinity : t.current))
  const hidden = doneIdx.length > MAX_DONE_SHOWN ? doneIdx.slice(0, doneIdx.length - MAX_DONE_SHOWN) : []
  const hiddenMs = hidden.reduce((sum, i) => sum + stepElapsed(plan.steps[i]!, d.now), 0)
  const allDone = t.done === t.total && t.total > 0
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Heading E={E} title="PLAN" width={W} right={<Text><Text bold color={allDone ? OK : ACC}>{t.done}</Text><Text color={DM}> / {t.total}</Text></Text>} />
      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        <Text bold color={WH} wrap="truncate-end">{plan.title}</Text>
        <Rail T={Text} plan={plan} n={d.n} width={W} current={t.current} />
        <Box flexDirection="column" marginTop={1}>
          {hidden.length > 0 && (
            <Box justifyContent="space-between">
              <Text color={DM}><Text color={ACC}>✓</Text>  … {hidden.length} étapes faites</Text>
              <Box flexShrink={0}><Text color={DM}>{fmtDur(hiddenMs)}</Text></Box>
            </Box>
          )}
          {plan.steps.map((s, i) => {
            if (hidden.includes(i)) return null
            if (s.status === 'in_progress' || s.status === 'blocked') return <Current E={E} d={d} s={s} i={i} W={W} />
            return <StepRow E={E} s={s} d={d} />
          })}
        </Box>
        <Box flexGrow={1} minHeight={1} />
        <Box gap={1}>
          <Tile E={E} label="ÉCOULÉ" value={fmtDur(t.elapsedMs)} color={WH} />
          <Tile E={E} label="RESTE ≈" value={allDone ? 'fini' : `${fmtDur(t.remainingMs)}${t.hasUnknown ? ' +?' : ''}`} color={ACC} />
          <Tile E={E} label="FIN ≈" value={allDone ? '✓' : fmtClock(d.now + t.remainingMs, d.tz)} color={ACC} />
        </Box>
      </Box>
    </Box>
  )
}

function Current({ E, d, s, i, W }: { E: Els; d: ViewData; s: Step; i: number; W: number }) {
  const { Box, Text } = E
  const isBlocked = s.status === 'blocked'
  const frame = isBlocked ? HOT : ACC
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={frame} paddingX={1} key={`cur-${i}`}>
      <Box justifyContent="space-between">
        <Text wrap="truncate-end">{stepIcon(Text, s, d.n)} <Text bold color={frame}>{s.id}</Text> <Text bold color={WH}>{s.title}</Text></Text>
        <Box flexShrink={0} marginLeft={1}>{stepTime(Text, s, d.now)}</Box>
      </Box>
      {isBlocked
        ? <Text bold color={d.n % 8 < 4 ? HOT : DM}>⚑ attend une décision de l'opérateur</Text>
        : <StepBar T={Text} s={s} now={d.now} n={d.n} width={W - 12} />}
      {(s.done ?? []).map(note => <Text wrap="truncate-end"><Text color={ACC}>✓</Text> <Text color={DM}>{note}</Text></Text>)}
      {s.note && <Text wrap="truncate-end"><Text bold color={ACC}>›</Text> <Text color={WH}>{s.note}</Text></Text>}
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
        <Text bold color={ACC}>◢◤ {spaced('COCKPIT')}</Text>
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
        <Box width={colW}><Gauge E={E} n={d.n} label="SESSION · 5 H" pct={limit(a, 'five_hour')?.percentUsed} width={colW} info={resetInfo(d, 'five_hour', 'fin dans')} /></Box>
        <Box width={colW}><Gauge E={E} n={d.n} label="SEMAINE" pct={limit(a, 'seven_day')?.percentUsed} width={colW} info={resetInfo(d, 'seven_day', 'renouvellement')} /></Box>
        <Box width={colW} flexDirection="column"><Context E={E} d={d} width={colW} /></Box>
      </Box>
      {d.plan ? <BandPlan E={E} d={d} plan={d.plan} W={W} /> : (
        <Text><Text bold color={DM}>{spaced('PLAN')}  </Text><Text color={ACC}>{wave(d.n, 24)}</Text><Text color={DM}>  la frise apparaît dès que Claude déclare un plan</Text></Text>
      )}
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
            <Text color={DM}>  ·  reste ≈ </Text><Text bold color={ACC}>{allDone ? 'fini' : `${fmtDur(t.remainingMs)}${t.hasUnknown ? ' +?' : ''}`}</Text>
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
        <Rail T={Text} plan={plan} n={d.n} width={W} current={t.current} />
      )}
      {cur && (
        <Text wrap="truncate-end">
          <Text bold color={cur.status === 'blocked' ? HOT : ACC}>› </Text>
          {!isColumns && <Text bold color={WH}>{cur.id} {cur.title}  </Text>}
          {cur.status === 'blocked' ? <Text bold color={HOT}>attend une décision de l'opérateur</Text> : <Text color={WH}>{cur.note ?? ''}</Text>}
          {(() => {
            const next = plan.steps.slice(t.current + 1).find(s => s.status === 'pending')
            return next ? <Text color={DM}>{`   ·   ensuite : ${next.title}`}</Text> : null
          })()}
        </Text>
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
