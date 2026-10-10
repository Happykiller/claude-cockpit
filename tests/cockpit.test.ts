import { expect, mock, test } from 'claude-code/testing'

import { fmtDur, fromTodos, modeFromHint, moveStep, parseEstimate, prettyModel, setPlan, totals, MIN } from '../hooks/model'

const T0 = Date.UTC(2026, 9, 10, 8, 0, 0)

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
})

test('une étape terminée sans avoir été ouverte part de la fin de la précédente', async () => {
  let plan = setPlan(null, { title: 'X', steps: [{ title: 'A', estimate_min: 5 }, { title: 'B', estimate_min: 5 }] }, T0)
  plan = moveStep(plan, 0, 'completed', T0 + 4 * MIN)
  plan = moveStep(plan, 1, 'completed', T0 + 10 * MIN)
  expect(plan.steps[1]!.startedAt).toBe(T0 + 4 * MIN)
  expect(totals(plan, T0 + 10 * MIN).remainingMs).toBe(0)
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
  const refused = await $.tool.call({ tool: 'mcp__cockpit__step', step: 9, status: 'completed' })
  expect(refused.deny).toContain('étape 9')

  const dock = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58), viewport: { columns: 200, rows: 50, isFullscreen: true } })
  await dock.drawn()
  expect(await dock.find({ text: /COCKPIT/ })).toBeDefined()
  expect(await dock.find({ text: /P09 LE CONSTRUIT/ })).toBeDefined()
  expect(await dock.find({ text: /rive glissante/ })).toBeDefined()
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
