import type { ElementTable, RenderChildren } from 'claude-code'

import type { Activity, Plan, Step } from '../types'
import {
  bar, fmtClock, fmtDur, fmtEstimate, fmtTokens, fmtWhen, prettyModel, sparkline,
  SPINNER, stepElapsed, tone, totals, wave, MIN,
} from './model'

export type Els = Pick<ElementTable, 'Box' | 'Text'>

export type ViewData = {
  activity: Activity
  history: readonly number[]
  plan: Plan | null
  n: number
  now: number
  working: boolean
  tz: number
  cols: number
}

const CY = '#5CD4F0'
const AM = '#FFB547'
const CO = '#FF8A66'
const DM = '#7D8799'
const FA = '#3A4356'
const WH = '#FFFFFF'
const INK = '#0A0D13'

const TONE = { ok: CY, warn: AM, hot: CO } as const

const MODES: Record<string, { label: string; fg: string; bg?: string }> = {
  default: { label: 'DEFAULT', fg: DM },
  acceptEdits: { label: '⏵⏵ ACCEPT EDITS', fg: INK, bg: CY },
  plan: { label: '⏸ PLAN', fg: CY },
  auto: { label: '⏵⏵ AUTO', fg: INK, bg: AM },
  dontAsk: { label: 'DONT ASK', fg: AM },
  bypassPermissions: { label: '⚠ BYPASS', fg: INK, bg: CO },
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

function limit(a: Activity, kind: string) {
  return a.limits.find(l => l.kind === kind)
}

// ── Pieces both placements share ───────────────────────────────────────────

function Chip({ T, mode }: { T: Els['Text']; mode: string | undefined }) {
  const m = (mode && MODES[mode]) || { label: mode ?? '—', fg: DM }
  return <T bold color={m.fg} backgroundColor={m.bg}>{` ${m.label} `}</T>
}

function Effort({ T, effort }: { T: Els['Text']; effort: string | undefined }) {
  const idx = effort ? EFFORTS.indexOf(effort) : -1
  const lit = (i: number) => (i > idx ? FA : i === idx ? (idx === 4 ? CO : AM) : CY)
  return (
    <T>
      {EFFORTS.map((_, i) => <T color={lit(i)}>▮</T>)}
      <T bold> {effort ?? '—'}</T>
    </T>
  )
}

function Gauge({ E, label, pct, width, info }: { E: Els; label: string; pct: number | undefined; width: number; info: [string, string, string?] }) {
  const { Box, Text } = E
  const color = TONE[tone(pct)]
  const b = bar(pct ?? 0, width)
  const isHot = tone(pct) === 'hot'
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color={DM}>{label}</Text>
        <Text bold color={color}>{pct === undefined ? '—' : `${Math.round(pct)} %`}{isHot ? ' ⚑' : ''}</Text>
      </Box>
      <Text wrap="truncate-end"><Text color={color}>{b.full}</Text><Text color={FA}>{b.empty}</Text></Text>
      <Box justifyContent="space-between">
        <Text color={DM} wrap="truncate-end">{info[0]}</Text>
        <Text wrap="truncate-end">{info[1]}<Text color={DM}>{info[2] ?? ''}</Text></Text>
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

/** The rail: one node per step, joined by connectors sized to the room. */
function Rail({ T, plan, n, width, current }: { T: Els['Text']; plan: Plan; n: number; width: number; current: number }) {
  const count = plan.steps.length
  const gap = count > 1 ? Math.max(1, Math.min(8, Math.floor((width - count - 6) / (count - 1)))) : 0
  const blink = n % 6 < 3
  const parts: RenderChildren[] = []
  plan.steps.forEach((s, i) => {
    if (i > 0) {
      const isLit = s.status === 'completed' || i === current
      const color = s.status === 'completed' ? CY : i === current ? AM : FA
      parts.push(<T color={color}>{(isLit ? '━' : '┄').repeat(gap)}</T>)
    }
    parts.push(node(T, s, i === current, blink))
  })
  return <T wrap="truncate-end">{parts}</T>
}

function node(T: Els['Text'], s: Step, isCurrent: boolean, blink: boolean) {
  switch (s.status) {
    case 'completed': return <T color={CY}>●</T>
    case 'skipped': return <T color={FA}>⊘</T>
    case 'blocked': return <T bold color={CO}>{blink ? '✗' : '✕'}</T>
    case 'in_progress': return <T bold color={blink ? AM : WH}>{blink ? '◉' : '◎'}</T>
    default: return <T color={isCurrent ? AM : DM}>○</T>
  }
}

/** The running step's bar: a sweep of light while it runs, coral past its estimate. */
function StepBar({ T, s, now, n, width }: { T: Els['Text']; s: Step; now: number; n: number; width: number }) {
  const el = stepElapsed(s, now)
  const w = Math.max(6, width)
  if (s.estimateMin === undefined) {
    const pos = n % (w + 4)
    const cells = Array.from({ length: w }, (_, i) => (i >= pos - 3 && i <= pos ? '▰' : '▱'))
    const lit = cells.join('')
    return <T wrap="truncate-end"><T color={FA}>{lit.slice(0, Math.max(0, pos - 3))}</T><T color={AM}>{lit.slice(Math.max(0, pos - 3), pos + 1)}</T><T color={FA}>{lit.slice(pos + 1)}</T><T color={DM}>  sans estimation</T></T>
  }
  const ratio = el / (s.estimateMin * MIN)
  if (ratio <= 1) {
    const filled = Math.max(1, Math.round(ratio * w))
    const sweep = n % (filled + 8)
    const a = Math.min(filled, Math.max(0, sweep - 1))
    const b = Math.min(filled, sweep + 1)
    return (
      <T wrap="truncate-end">
        <T color={AM}>{'▰'.repeat(a)}</T><T bold color={WH}>{'▰'.repeat(b - a)}</T><T color={AM}>{'▰'.repeat(filled - b)}</T>
        <T color={FA}>{'▱'.repeat(w - filled)}</T>
        <T bold color={AM}>{`  ${Math.min(99, Math.round(ratio * 100))} %`}</T>
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
      {cells(0, mark, AM)}<T bold color={WH}>│</T>{cells(mark + 1, w, CO)}
      <T bold color={CO}>{`  +${Math.round((ratio - 1) * 100)} %`}</T>
    </T>
  )
}

function stepTime(T: Els['Text'], s: Step, now: number) {
  const est = s.estimateMin === undefined ? undefined : s.estimateMin * MIN
  if (s.status === 'pending') return <T color={DM}>{`~${fmtEstimate(s.estimateMin)}`}</T>
  if (s.status === 'skipped') return <T color={FA}>—</T>
  const el = stepElapsed(s, now)
  const isOver = est !== undefined && el > est * 1.05
  const isRunning = s.status === 'in_progress'
  return (
    <T>
      <T bold={isRunning} color={isOver ? CO : isRunning ? AM : undefined}>{fmtDur(el)}</T>
      <T color={DM}>{` / ${isRunning ? '~' : ''}${fmtEstimate(s.estimateMin)}`}</T>
    </T>
  )
}

function stepIcon(T: Els['Text'], s: Step, n: number) {
  switch (s.status) {
    case 'completed': return <T color={CY}>✓</T>
    case 'skipped': return <T color={FA}>⊘</T>
    case 'blocked': return <T bold color={CO}>✗</T>
    case 'in_progress': return <T color={AM}>{SPINNER[n % SPINNER.length]}</T>
    default: return <T color={DM}>○</T>
  }
}

// ── The side panel ─────────────────────────────────────────────────────────

export function Dock({ E, d }: { E: Els; d: ViewData }) {
  const { Box, Text } = E
  const W = Math.max(30, d.cols)
  const a = d.activity
  const live = d.working ? (d.n % 8 < 4 ? AM : '#7A5A24') : DM
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold color={CY}>◢◤ COCKPIT</Text>
          <Text><Text color={DM}>{fmtClock(d.now, d.tz, true)}  </Text><Text color={live}>●</Text><Text bold color={d.working ? AM : DM}>{d.working ? ' LIVE' : ' VEILLE'}</Text></Text>
        </Box>
        <Text color={FA} wrap="truncate-end">{'━'.repeat(W)}</Text>
      </Box>

      <Box flexDirection="column" gap={1}>
        <Text bold color={DM}>ACTIVITÉ</Text>
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
        <Gauge E={E} label="SESSION · 5 H" pct={limit(a, 'five_hour')?.percentUsed} width={W} info={resetInfo(d, 'five_hour', 'fin de fenêtre dans')} />
        <Gauge E={E} label="SEMAINE" pct={limit(a, 'seven_day')?.percentUsed} width={W} info={resetInfo(d, 'seven_day', 'renouvellement dans')} />
        <Gauge
          E={E}
          label="CONTEXTE"
          pct={a.contextPercent}
          width={W}
          info={[`${fmtTokens(a.contextTokens)} / ${fmtTokens(a.contextWindow)}`, `${sparkline(d.history, 16)}`]}
        />
        <Box justifyContent="space-between">
          <Text bold color={DM}>SESSION</Text>
          <Text>{a.startedAt ? fmtDur(d.now - a.startedAt) : '—'}<Text color={DM}> · </Text>{a.costUsd === undefined ? '—' : `${a.costUsd.toFixed(2).replace('.', ',')} $`}</Text>
        </Box>
      </Box>

      <Text color={FA} wrap="truncate-end">{'━'.repeat(W)}</Text>
      {d.plan ? <DockPlan E={E} d={d} plan={d.plan} W={W} /> : <Idle E={E} d={d} W={W} />}
    </Box>
  )
}

function Idle({ E, d, W }: { E: Els; d: ViewData; W: number }) {
  const { Box, Text } = E
  return (
    <Box flexDirection="column" alignItems="center">
      <Box alignSelf="flex-start"><Text bold color={DM}>PLAN</Text></Box>
      <Text color={CY}>{wave(d.n, Math.min(28, W))}</Text>
      <Text color={DM}>la frise apparaît dès que Claude déclare un plan</Text>
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
    <Box flexDirection="column" gap={1}>
      <Box justifyContent="space-between">
        <Text bold color={DM} wrap="truncate-end">PLAN · {plan.title.toUpperCase()}</Text>
        <Text><Text bold color={allDone ? CY : AM}>{t.done}</Text><Text color={DM}> / {t.total}</Text></Text>
      </Box>
      <Rail T={Text} plan={plan} n={d.n} width={W} current={t.current} />
      <Box flexDirection="column">
        {hidden.length > 0 && (
          <Box justifyContent="space-between">
            <Text color={DM}><Text color={CY}>✓</Text> … {hidden.length} étapes faites</Text>
            <Text color={DM}>{fmtDur(hiddenMs)}</Text>
          </Box>
        )}
        {plan.steps.map((s, i) => {
          if (hidden.includes(i)) return null
          if (s.status === 'in_progress' || s.status === 'blocked') return <Current E={E} d={d} s={s} i={i} W={W} />
          const isPending = s.status === 'pending'
          return (
            <Box justifyContent="space-between" gap={1}>
              <Text wrap="truncate-end">
                {stepIcon(Text, s, d.n)} <Text color={DM}>{s.id}</Text> <Text color={isPending ? DM : s.status === 'skipped' ? FA : undefined} strikethrough={s.status === 'skipped'}>{s.title}</Text>
              </Text>
              {stepTime(Text, s, d.now)}
            </Box>
          )
        })}
      </Box>
      <Box gap={1}>
        <Tile E={E} label="ÉCOULÉ" value={fmtDur(t.elapsedMs)} color={WH} />
        <Tile E={E} label="RESTE ≈" value={allDone ? 'fini' : `${fmtDur(t.remainingMs)}${t.hasUnknown ? ' +?' : ''}`} color={AM} />
        <Tile E={E} label="FIN ≈" value={allDone ? '✓' : fmtClock(d.now + t.remainingMs, d.tz)} color={CY} />
      </Box>
    </Box>
  )
}

function Current({ E, d, s, i, W }: { E: Els; d: ViewData; s: Step; i: number; W: number }) {
  const { Box, Text } = E
  const isBlocked = s.status === 'blocked'
  const frame = isBlocked ? CO : AM
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={frame} paddingX={1} key={`cur-${i}`}>
      <Box justifyContent="space-between" gap={1}>
        <Text wrap="truncate-end">{stepIcon(Text, s, d.n)} <Text bold color={frame}>{s.id}</Text> <Text bold color={WH}>{s.title}</Text></Text>
        {stepTime(Text, s, d.now)}
      </Box>
      {isBlocked
        ? <Text bold color={d.n % 8 < 4 ? CO : DM}>⚑ attend une décision de l'opérateur</Text>
        : <StepBar T={Text} s={s} now={d.now} n={d.n} width={W - 12} />}
      {s.note && <Text wrap="truncate-end"><Text color={AM}>› </Text>{s.note}</Text>}
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

// ── The band above the prompt ──────────────────────────────────────────────

export function Band({ E, d }: { E: Els; d: ViewData }) {
  const { Box, Text } = E
  const W = Math.max(60, d.cols)
  const a = d.activity
  const colW = Math.floor((W - 6) / 3)
  const live = d.working ? (d.n % 8 < 4 ? AM : '#7A5A24') : DM
  return (
    <Box flexDirection="column" gap={1}>
      <Box justifyContent="space-between">
        <Text bold color={CY}>◢◤ COCKPIT</Text>
        <Text>
          <Text bold color={WH}>◆ {prettyModel(a.model)}</Text>
          <Text color={DM}>   effort </Text><Effort T={Text} effort={a.effort} />
          <Text>   </Text><Chip T={Text} mode={a.mode} />
          <Text color={DM}>   {fmtClock(d.now, d.tz, true)} </Text><Text color={live}>●</Text>
        </Text>
      </Box>
      <Box gap={3}>
        <Box width={colW}><Gauge E={E} label="SESSION · 5 H" pct={limit(a, 'five_hour')?.percentUsed} width={colW} info={resetInfo(d, 'five_hour', 'fin dans')} /></Box>
        <Box width={colW}><Gauge E={E} label="SEMAINE" pct={limit(a, 'seven_day')?.percentUsed} width={colW} info={resetInfo(d, 'seven_day', 'renouvellement')} /></Box>
        <Box width={colW}>
          <Gauge
            E={E}
            label="CONTEXTE"
            pct={a.contextPercent}
            width={colW}
            info={[`${fmtTokens(a.contextTokens)} / ${fmtTokens(a.contextWindow)}`, `${a.startedAt ? fmtDur(d.now - a.startedAt) : '—'} · ${a.costUsd === undefined ? '—' : `${a.costUsd.toFixed(2).replace('.', ',')} $`}`]}
          />
        </Box>
      </Box>
      {d.plan ? <BandPlan E={E} d={d} plan={d.plan} W={W} /> : (
        <Text><Text bold color={DM}>PLAN  </Text><Text color={CY}>{wave(d.n, 24)}</Text><Text color={DM}>  la frise apparaît dès que Claude déclare un plan</Text></Text>
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
        <Text wrap="truncate-end"><Text bold color={DM}>PLAN · {plan.title.toUpperCase()}  </Text><Text bold color={allDone ? CY : AM}>{t.done}</Text><Text color={DM}>/{t.total}</Text></Text>
        <Text>
          <Text color={DM}>écoulé </Text><Text bold>{fmtDur(t.elapsedMs)}</Text>
          <Text color={DM}>  ·  reste ≈ </Text><Text bold color={AM}>{allDone ? 'fini' : `${fmtDur(t.remainingMs)}${t.hasUnknown ? ' +?' : ''}`}</Text>
          <Text color={DM}>  ·  fin ≈ </Text><Text bold color={CY}>{allDone ? '✓' : fmtClock(d.now + t.remainingMs, d.tz)}</Text>
        </Text>
      </Box>
      {isColumns ? (
        <Box gap={1}>
          {plan.steps.map((s, i) => {
            const isCur = i === t.current
            const lineColor = s.status === 'completed' ? CY : isCur ? AM : FA
            const fill = colW - 1
            return (
              <Box width={colW} flexDirection="column">
                <Text wrap="truncate-end">
                  {node(Text, s, isCur, d.n % 6 < 3)}
                  {isCur && s.status === 'in_progress' && s.estimateMin !== undefined
                    ? <BandSweep T={Text} s={s} now={d.now} n={d.n} width={fill} />
                    : <Text color={lineColor}>{(s.status === 'completed' ? '━' : '┄').repeat(fill)}</Text>}
                </Text>
                <Text wrap="truncate-end">{isCur ? stepIcon(Text, s, d.n) : <Text color={DM}>{s.id}</Text>} <Text bold={isCur} color={isCur ? WH : s.status === 'pending' ? DM : undefined}>{s.title}</Text></Text>
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
          <Text color={cur.status === 'blocked' ? CO : AM}>› </Text>
          {!isColumns && <Text bold color={WH}>{cur.id} {cur.title}  </Text>}
          {cur.status === 'blocked' ? <Text bold color={CO}>attend une décision de l'opérateur</Text> : <Text>{cur.note ?? ''}</Text>}
          {(() => {
            const next = plan.steps.slice(t.current + 1).find(s => s.status === 'pending')
            return next ? <Text color={DM}>{`   ·   ensuite : ${next.title}`}</Text> : null
          })()}
        </Text>
      )}
    </Box>
  )
}

function BandSweep({ T, s, now, n, width }: { T: Els['Text']; s: Step; now: number; n: number; width: number }) {
  const ratio = stepElapsed(s, now) / ((s.estimateMin ?? 1) * MIN)
  const filled = Math.max(1, Math.min(width, Math.round(Math.min(1, ratio) * width)))
  const sweep = n % (filled + 6)
  const base = ratio > 1 ? CO : AM
  return (
    <T>
      <T color={base}>{'━'.repeat(Math.min(filled, sweep))}</T>
      <T bold color={WH}>{sweep < filled ? '━' : ''}</T>
      <T color={base}>{'━'.repeat(Math.max(0, filled - sweep - 1))}</T>
      <T color={FA}>{'┄'.repeat(width - filled)}</T>
    </T>
  )
}
