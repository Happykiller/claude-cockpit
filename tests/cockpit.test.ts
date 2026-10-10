import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { fmtDur, fromTodos, measured, modeFromHint, moveStep, parseEstimate, prettyModel, project, ratioOf, setPlan, totals, MIN } from '../hooks/model'

const T0 = Date.UTC(2026, 9, 10, 8, 0, 0)

/** What the kit leaves unanswered: the toast, the notification, the classic hooks' core. */
function quiet(on: On) {
  on('ui.toast', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isSent: false as const, reason: 'no-surface' as const } }))
  on('classic.Stop', () => ({}))
  on('classic.SubagentStop', () => ({}))
}

const paneProps = (placement: 'dock' | 'inline', bodyColumns: number) => ({
  title: 'Cockpit',
  isFocused: false,
  bodyColumns,
  placement,
  scroll: { offset: 0, bodyRows: 60 },
  view: {},
})

test('les noms et les durées se lisent comme dans la maquette', async () => {
  expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(prettyModel('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
  expect(prettyModel('opus')).toBe('opus')
  expect(fmtDur(38 * MIN)).toBe('38 min')
  expect(fmtDur(108 * MIN)).toBe('1 h 48')
  expect(fmtDur((3 * 24 + 4) * 60 * MIN)).toBe('3 j 4 h')
  expect(modeFromHint('⏵⏵ auto mode on (shift+tab to cycle)')).toBe('auto')
  expect(modeFromHint('? for shortcuts')).toBe('default')
  expect(parseEstimate('Écrire l’épreuve (~20 min)')).toBe(20)
  expect(parseEstimate('Recuire le monde ~1 h 30')).toBe(90)
  expect(parseEstimate('Sans estimation')).toBeUndefined()
})

test('la frise mesure le passé et estime le reste', async () => {
  let plan = setPlan(null, { title: 'P09', steps: [{ title: 'A', estimate_min: 20 }, { title: 'B', estimate_min: 30 }, { title: 'C', estimate_min: 10 }] }, T0)
  plan = moveStep(plan, 0, 'in_progress', T0)
  plan = moveStep(plan, 0, 'completed', T0 + 25 * MIN)
  plan = moveStep(plan, 1, 'in_progress', T0 + 25 * MIN, { note: 'écrit le test' })
  const t = totals(plan, T0 + 35 * MIN)
  expect(t.done).toBe(1)
  expect(t.total).toBe(3)
  expect(t.current).toBe(1)
  expect(t.elapsedMs).toBe(35 * MIN)
  expect(t.remainingMs).toBe(30 * MIN)
  expect(t.hasUnknown).toBe(false)
  expect(plan.steps[1]!.note).toBe('écrit le test')
  plan = moveStep(plan, 1, 'in_progress', T0 + 36 * MIN, { note: 'le relit' })
  expect(plan.steps[1]!.done).toEqual(['écrit le test'])
  expect(plan.steps[1]!.startedAt).toBe(T0 + 25 * MIN)
})

test('une étape close sans avoir été ouverte part de la fin de la précédente, et le dit', async () => {
  let plan = setPlan(null, { title: 'X', steps: [{ title: 'A', estimate_min: 5 }, { title: 'B', estimate_min: 5 }] }, T0)
  plan = moveStep(plan, 0, 'completed', T0 + 4 * MIN)
  expect(plan.finishedAt).toBeUndefined()
  plan = moveStep(plan, 1, 'completed', T0 + 10 * MIN)
  expect(plan.steps[1]!.startedAt).toBe(T0 + 4 * MIN)
  expect(plan.steps[1]!.untimed).toBe(true)
  expect(plan.finishedAt).toBe(T0 + 10 * MIN)
  expect(totals(plan, T0 + 10 * MIN).remainingMs).toBe(0)
  // Rouverte, elle repart du moment où on l'ouvre, et le plan n'est plus fini.
  plan = moveStep(plan, 1, 'in_progress', T0 + 12 * MIN)
  expect(plan.steps[1]!.startedAt).toBe(T0 + 12 * MIN)
  expect(plan.steps[1]!.untimed).toBeUndefined()
  expect(plan.finishedAt).toBeUndefined()
})

test('seules les étapes chronométrées instruisent le calibrage', async () => {
  let plan = setPlan(null, { title: 'X', steps: [{ title: 'A', estimate_min: 10 }, { title: 'B', estimate_min: 10 }] }, T0)
  plan = moveStep(plan, 0, 'in_progress', T0)
  const before = plan
  plan = moveStep(plan, 0, 'completed', T0 + 15 * MIN)
  expect(measured(before, plan)).toEqual([[10, 15]])
  const after = plan
  plan = moveStep(plan, 1, 'completed', T0 + 16 * MIN)
  expect(measured(after, plan)).toEqual([])
  expect(ratioOf([[10, 15], [10, 15], [10, 15], [10, 15]])).toBeUndefined()
  expect(ratioOf([[10, 15], [10, 15], [10, 15], [10, 15], [60, 40]])).toBe(1)
})

test('la fenêtre de 5 h se projette au rythme des trois derniers quarts d’heure', async () => {
  const reset = T0 + 150 * MIN
  const fast: [number, number][] = [[T0, 40], [T0 + 10 * MIN, 45], [T0 + 20 * MIN, 50]]
  expect(project(fast, reset, T0 + 20 * MIN)).toEqual({ kind: 'cap', at: T0 + 120 * MIN })
  const slow: [number, number][] = [[T0, 40], [T0 + 20 * MIN, 42]]
  const p = project(slow, reset, T0 + 20 * MIN)
  expect(p?.kind).toBe('reset')
  expect(Math.round((p as { pct: number }).pct)).toBe(55)
  expect(project([[T0, 40], [T0 + 5 * MIN, 41]], reset, T0 + 5 * MIN)).toBeUndefined()
  expect(project(fast, T0, T0 + 20 * MIN)).toBeUndefined()
})

test('une liste TodoWrite devient une frise et garde ses chronos', async () => {
  const first = fromTodos(null, [
    { content: 'Lire (~5 min)', status: 'in_progress', activeForm: 'Lecture' },
    { content: 'Écrire (~15 min)', status: 'pending', activeForm: 'Écriture' },
  ], T0)!
  expect(first.steps[0]!.title).toBe('Lire')
  expect(first.steps[0]!.estimateMin).toBe(5)
  const second = fromTodos(first, [
    { content: 'Lire (~5 min)', status: 'completed', activeForm: 'Lecture' },
    { content: 'Écrire (~15 min)', status: 'in_progress', activeForm: 'Écriture' },
  ], T0 + 6 * MIN)!
  expect(second.steps[0]!.startedAt).toBe(T0)
  expect(second.steps[0]!.endedAt).toBe(T0 + 6 * MIN)
  expect(second.steps[1]!.note).toBe('Écriture')
})

test('les outils du cockpit tiennent le plan, et les deux placements le dessinent', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  const declared = await $.tool.call({
    tool: 'mcp__cockpit__plan',
    title: 'P09 Le construit',
    steps: [
      { title: 'Hydrologie', estimate_min: 120 },
      { title: 'Monde modifiable', estimate_min: 120 },
      { title: 'Réponses de corps', estimate_min: 70 },
    ],
  })
  expect(declared.deny).toBeUndefined()
  await $.tool.call({ tool: 'mcp__cockpit__step', step: 1, status: 'completed' })
  await clock.advance(5 * MIN)
  await $.tool.call({ tool: 'mcp__cockpit__step', step: 2, status: 'in_progress', note: 'épreuve de la rive glissante' })
  await $.tool.call({ tool: 'mcp__cockpit__step', step: 2, status: 'in_progress', note: 'relecture du lot' })
  const refused = await $.tool.call({ tool: 'mcp__cockpit__step', step: 9, status: 'completed' })
  expect(refused.deny).toContain('étape 9')

  const dock = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58), viewport: { columns: 200, rows: 50, isFullscreen: true } })
  await dock.drawn()
  expect(await dock.find({ text: /C O C K P I T/ })).toBeDefined()
  expect(await dock.find({ text: /P09 Le construit/ })).toBeDefined()
  expect(await dock.find({ text: /rive glissante/ })).toBeDefined()
  expect(await dock.find({ text: /relecture du lot/ })).toBeDefined()
  expect(await dock.find({ text: /RESTE/ })).toBeDefined()
  await dock.unmount()

  const band = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('inline', 180), viewport: { columns: 182, rows: 40, isFullscreen: false } })
  await band.drawn()
  expect(await band.find({ text: /SEMAINE/ })).toBeDefined()
  expect(await band.find({ text: /Monde modifiable/ })).toBeDefined()
  await band.unmount()
})

test('sans plan, le cockpit attend en veille', async ($, on) => {
  mock.clock(on, { now: T0 })
  const ui = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 50) })
  await ui.drawn()
  expect(await ui.find({ text: /la frise apparaît/ })).toBeDefined()
  await ui.unmount()
})

test('le cockpit montre le travail laissé en fond et son calibrage', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  quiet(on)
  mock.store(on, { samples: [[10, 14], [10, 14], [20, 28], [5, 7], [5, 7]] })
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [
    { id: 'b1', type: 'shell', status: 'running', description: 'banc inversé' },
    { id: 'a1', type: 'subagent', status: 'running', description: 'P09 E6b — Windows' },
  ] })
  await $.classic.SubagentStop({ stop_hook_active: false, agent_id: 'a1', agent_transcript_path: '/tmp/a1', agent_type: 'general-purpose' })
  await $.tool.call({ tool: 'mcp__cockpit__plan', title: 'Lot', steps: [{ title: 'Un', estimate_min: 10 }, { title: 'Deux', estimate_min: 10 }] })
  await $.tool.call({ tool: 'mcp__cockpit__step', step: 1, status: 'in_progress' })
  await clock.advance(14 * MIN)
  await $.tool.call({ tool: 'mcp__cockpit__step', step: 1, status: 'completed' })
  await $.tool.call({ tool: 'mcp__cockpit__step', step: 2, status: 'in_progress' })
  const dock = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58), viewport: { columns: 200, rows: 50, isFullscreen: true } })
  await dock.drawn()
  const seen = async (re: RegExp) => [re.source, (await dock.find({ text: re })) !== undefined]
  expect(await seen(/EN FOND/)).toEqual(['EN FOND', true])
  expect(await seen(/banc inversé/)).toEqual(['banc inversé', true])
  expect(await seen(/P09 E6b/)).toEqual(['P09 E6b', false])
  expect(await seen(/×1,4/)).toEqual(['×1,4', true])
  expect(await seen(/fin réaliste/)).toEqual(['fin réaliste', true])
  await dock.unmount()
})

test('un plan fini laisse place à l’historique au bout de dix minutes', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  quiet(on)
  mock.store(on)
  await $.tool.call({ tool: 'mcp__cockpit__plan', title: 'Court', steps: [{ title: 'Seule', estimate_min: 5 }] })
  await $.tool.call({ tool: 'mcp__cockpit__step', step: 1, status: 'in_progress' })
  await clock.advance(4 * MIN)
  await $.tool.call({ tool: 'mcp__cockpit__step', step: 1, status: 'completed' })
  await clock.advance(11 * MIN)
  const ui = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58) })
  await ui.drawn()
  const seen = async (re: RegExp) => [re.source, (await ui.find({ text: re })) !== undefined]
  expect(await seen(/Seule/)).toEqual(['Seule', false])
  expect(await seen(/D E R N I E R S/)).toEqual(['D E R N I E R S', true])
  expect(await seen(/Court/)).toEqual(['Court', true])
  await ui.unmount()
})
