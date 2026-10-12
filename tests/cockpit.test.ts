import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { endedTasks, fmtDur, fromTodos, isNewer, measured, modeTracker, moveStep, pillOf, readFooter, releaseOf, settleFooter, parseEstimate, apportion, placeLabels, prettyModel, project, ratioOf, setPlan, spread, timeline, totals, MIN } from '../hooks/model'

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
  expect(pillOf('⏵⏵ auto mode on (shift+tab to cycle)')).toBe('auto')
  expect(pillOf('⏸ manual mode on')).toBe('default')
  expect(pillOf('⏵⏵ auto-accept edits on (shift+tab to cycle)')).toBe('acceptEdits')
  expect(pillOf('⏵⏵ accept edits on · auto mode available')).toBe('acceptEdits')
  expect(pillOf('⏵⏵ bypass permissions on')).toBe('bypassPermissions')
  expect(pillOf('? for shortcuts · ← for agents')).toBeUndefined()
  expect(parseEstimate('Écrire l’épreuve (~20 min)')).toBe(20)
  expect(parseEstimate('Recuire le monde ~1 h 30')).toBe(90)
  expect(parseEstimate('Sans estimation')).toBeUndefined()
})

test('le mode suit shift+tab : le pied de prompt montre un instant le mode quitté', () => {
  // Les lectures relevées en vrai, de auto à auto par un tour complet.
  const reads: [number, string][] = [
    [0, '(shift+tab to cycle) · ← for agents'],
    [2487, 'auto mode on (shift+tab to cycle) · ← for agents'],
    [2489, '? for shortcuts · ← for agents'],
    [8586, 'manual mode on · ? for shortcuts · ← for agents'],
    [8588, '(shift+tab to cycle) · ← for agents'],
    [10337, 'accept edits on (shift+tab to cycle) · ← for agents'],
    [10338, '(shift+tab to cycle) · ← for agents'],
    [11913, 'plan mode on (shift+tab to cycle) · ← for agents'],
    [11914, '(shift+tab to cycle) · ← for agents'],
  ]
  const tk = modeTracker()
  const seen = reads.map(([at, text]) => readFooter(tk, text, at)).filter(Boolean)
  expect(seen).toEqual(['default', 'acceptEdits', 'plan', 'auto'])
})

test('le cycle propre à la personne s’apprend, et une pastille qui reste est le mode lui-même', () => {
  const tk = modeTracker()
  // plan → contournement des permissions, absent du cycle par défaut.
  readFooter(tk, 'plan mode on (shift+tab to cycle)', 0)
  expect(readFooter(tk, '(shift+tab to cycle)', 1)).toBe('auto')
  readFooter(tk, 'bypass permissions on (shift+tab to cycle)', 5000)
  // Personne ne relit la ligne : la pastille est le mode affiché.
  expect(settleFooter(tk, 5050)).toBeUndefined()
  expect(settleFooter(tk, 5200)).toBe('bypassPermissions')
  expect(tk.cycle.plan).toBe('bypassPermissions')
  // Le shift+tab suivant part de là, avec le cycle appris.
  readFooter(tk, 'bypass permissions on (shift+tab to cycle)', 9000)
  expect(readFooter(tk, '? for shortcuts', 9001)).toBe('default')
  readFooter(tk, 'plan mode on (shift+tab to cycle)', 12000)
  expect(readFooter(tk, '(shift+tab to cycle)', 12001)).toBe('bypassPermissions')
})

test('la frise se répartit sur toute la largeur', async () => {
  expect(spread(50, 3)).toEqual([16, 17, 17])
  expect(spread(54 - 4, 3).reduce((a, b) => a + b, 0)).toBe(50)
  expect(spread(2, 5)).toEqual([1, 1, 1, 1, 1])
  expect(spread(10, 0)).toEqual([])
})

test('la frise place chaque étape sur l’horloge', async () => {
  let plan = setPlan(null, { title: 'P', steps: [{ title: 'A', estimate_min: 20 }, { title: 'B', estimate_min: 30 }, { title: 'C' }] }, T0)
  plan = moveStep(plan, 0, 'in_progress', T0)
  plan = moveStep(plan, 0, 'completed', T0 + 25 * MIN)
  plan = moveStep(plan, 1, 'in_progress', T0 + 25 * MIN)
  // B dépasse son estimation : elle s'étire jusqu'à maintenant et pousse la suite.
  const tl = timeline(plan, T0 + 60 * MIN)
  expect(tl.spans.map(s => [(s.start - T0) / MIN, (s.end - T0) / MIN, s.isStartReal])).toEqual([[0, 25, true], [25, 60, true], [60, 60, false]])
  expect(tl.isEndReal).toBe(false)
  expect(apportion([25, 35, 0], 30, 6)).toEqual([11, 13, 6])
  // Trop étroit pour le minimum : chacun a sa part égale, le reste aux premiers.
  expect(apportion([1, 1, 1, 1], 10, 6)).toEqual([3, 3, 2, 2])
  // La première venue l'emporte ; ce qui chevauche ou déborde est omis.
  expect(placeLabels(20, [{ col: 6, text: 'cur' }, { col: 0, text: 'fin', right: true }, { col: 5, text: 'x' }, { col: 0, text: 'aa' }]).map(l => [l.at, l.text]))
    .toEqual([[0, 'aa'], [6, 'cur'], [17, 'fin']])
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
  // Le titre a sa ligne ; l'écoulé et le reste viennent dessous.
  expect(await dock.find({ type: 'Text', text: /^P09 Le construit$/ })).toBeDefined()
  expect(await dock.find({ type: 'Text', text: /^écoulé .+  ·  reste ≈ / })).toBeDefined()
  // 58 colonnes, deux de marge de chaque côté : la frise court sur les 54 restantes.
  expect((await dock.find({ text: /^●━+◉━+○━+⚑$/ }))?.text.length).toBe(54)
  // Sous les nœuds : le départ réel, celui de l'étape en cours, le départ prévu, la fin prévue.
  const hours = (await dock.find({ text: /^08:00 +08:05/ }))?.text ?? ''
  expect(hours.split(/ +/)).toEqual(['08:00', '08:05', '~10:05', '~11:15'])
  expect(hours.length).toBe(54)
  expect(await dock.find({ text: /^ +1 +2 +3 +fin$/ })).toBeDefined()
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

test('le cockpit montre le travail laissé en fond, le calibrage reste en coulisse', async ($, on) => {
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
  expect(await seen(/^EN FOND$/)).toEqual(['^EN FOND$', true])
  expect(await seen(/banc inversé/)).toEqual(['banc inversé', true])
  expect(await seen(/P09 E6b/)).toEqual(['P09 E6b', false])
  expect(await seen(/×1,4/)).toEqual(['×1,4', false])
  await dock.unmount()
})

test('un plan fini laisse place à l’historique de la session au bout de dix minutes', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  quiet(on)
  on('session.id', () => ({ value: 'ici' }))
  mock.store(on, { plans: [
    { title: 'Ailleurs', finishedAt: T0 - 60 * MIN, steps: 2, estimateMin: 20, realMs: 18 * MIN, sessionId: 'autre' },
    { title: 'Avant les sessions', finishedAt: T0 - 90 * MIN, steps: 1, estimateMin: 5, realMs: 4 * MIN },
  ] })
  await $.tool.call({ tool: 'mcp__cockpit__plan', title: 'Court', steps: [{ title: 'Seule', estimate_min: 5 }] })
  await $.tool.call({ tool: 'mcp__cockpit__step', step: 1, status: 'in_progress' })
  await clock.advance(4 * MIN)
  await $.tool.call({ tool: 'mcp__cockpit__step', step: 1, status: 'completed' })
  await clock.advance(11 * MIN)
  const ui = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58) })
  await ui.drawn()
  const seen = async (re: RegExp) => [re.source, (await ui.find({ text: re })) !== undefined]
  expect(await seen(/Seule/)).toEqual(['Seule', false])
  expect(await seen(/P L A N S   D E   L A   S E S S I O N/)).toEqual(['P L A N S   D E   L A   S E S S I O N', true])
  expect(await seen(/Court/)).toEqual(['Court', true])
  expect(await seen(/Ailleurs/)).toEqual(['Ailleurs', false])
  expect(await seen(/Avant les sessions/)).toEqual(['Avant les sessions', false])
  await ui.unmount()
})

test('la configuration et l’activité se séparent, les tokens de la session se cumulent', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  quiet(on)
  const usages = [
    { input_tokens: 2_000, output_tokens: 1_500, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 8_000 },
    { input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  ]
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { ...usages[e.index]!, model: e.model } }
  })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })) void _
  for await (const _ of $.turn.step({ turnId: 't1', index: 1, model: 'claude-opus-5-5', messageCount: 1, agentId: 'a1' })) void _
  await clock.advance(0)

  const dock = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58), viewport: { columns: 200, rows: 60, isFullscreen: true } })
  await dock.drawn()
  const seen = async (re: RegExp) => [re.source, (await dock.find({ text: re })) !== undefined]
  expect(await seen(/C O N F I G U R A T I O N/)).toEqual(['C O N F I G U R A T I O N', true])
  expect(await seen(/A C T I V I T É/)).toEqual(['A C T I V I T É', true])
  // 101 k envoyés (dont 90 k lus et 8 k écrits au cache) + 2 k reçus, sur deux requêtes, sous-agent compris.
  expect(await seen(/^103 k$/)).toEqual(['^103 k$', true])
  expect(await seen(/^2 req\.$/)).toEqual(['^2 req\\.$', true])
  expect(await seen(/^ 101 k$/)).toEqual(['^ 101 k$', true])
  expect(await seen(/^89 %$/)).toEqual(['^89 %$', true])
  // Le cache tient en une ligne : la part relue, et pourquoi elle compte.
  expect(await seen(/^ relus du cache, ≈ 10× moins chers$/)).toEqual(['^ relus du cache, ≈ 10× moins chers$', true])
  expect(await seen(/S T A T I S T I Q U E S/)).toEqual(['S T A T I S T I Q U E S', true])
  await dock.unmount()

  const band = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('inline', 180), viewport: { columns: 182, rows: 40, isFullscreen: false } })
  await band.drawn()
  expect(await band.find({ text: /relus du cache/ })).toBeDefined()
  await band.unmount()
})

test('une tâche de fond finie quitte la liste dès sa notification, un sous-agent fini aussi', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  quiet(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('agent.list', () => ({ value: [
    { id: 'a1', description: 'revue du lot', type: 'general-purpose', status: 'running' as const },
    { id: 'a2', description: 'carto', type: 'Explore', status: 'completed' as const },
  ] }))
  on('classic.SessionStart', () => ({}))
  on('turn.complete', () => ({ text: '' }))
  on('session.usage', () => ({ value: { startedAt: T0, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  expect(endedTasks('<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n</task-notification>')).toEqual(['b1'])
  expect(endedTasks('<task-notification><task-id>m1</task-id><summary>un événement</summary></task-notification>')).toEqual([])

  await $.classic.Stop({ stop_hook_active: false, background_tasks: [
    { id: 'b1', type: 'shell', status: 'running', description: 'banc inversé' },
    { id: 'b2', type: 'shell', status: 'running', description: 'serveur de dev' },
    { id: 'a1', type: 'subagent', status: 'running', description: 'a1' },
    { id: 'a2', type: 'subagent', status: 'running', description: 'a2' },
  ] })
  await $.prompt.submit({ text: '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n<summary>fini</summary>\n</task-notification>', origin: { kind: 'task-notification' }, wait: false })
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1000, isAborted: false, reason: 'answer' })
  await clock.advance(0)

  const dock = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58), viewport: { columns: 200, rows: 60, isFullscreen: true } })
  await dock.drawn()
  const seen = async (re: RegExp) => [re.source, (await dock.find({ text: re })) !== undefined]
  expect(await seen(/banc inversé/)).toEqual(['banc inversé', false])
  expect(await seen(/serveur de dev/)).toEqual(['serveur de dev', true])
  expect(await seen(/revue du lot/)).toEqual(['revue du lot', true])
  expect(await seen(/^a2$/)).toEqual(['^a2$', false])
  await dock.unmount()

  // Une nouvelle session repart sans rien en fond.
  await $.classic.SessionStart({ source: 'clear' })
  const fresh = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58), viewport: { columns: 200, rows: 60, isFullscreen: true } })
  await fresh.drawn()
  expect(await fresh.find({ text: /^EN FOND$/ })).toBeUndefined()
  await fresh.unmount()
})

test('un titre de section se replie et se rouvre', async ($, on) => {
  mock.clock(on, { now: T0 })
  quiet(on)
  mock.store(on)
  const dock = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58), viewport: { columns: 200, rows: 60, isFullscreen: true } })
  await dock.drawn()
  const seen = async (re: RegExp) => [re.source, (await dock.find({ text: re })) !== undefined]
  expect(await seen(/▾ C O N F I G U R A T I O N/)).toEqual(['▾ C O N F I G U R A T I O N', true])
  expect(await seen(/^MODÈLE$/)).toEqual(['^MODÈLE$', true])

  await dock.press({ key: 'fold:config' })
  await dock.press({ key: 'fold:activity' })
  await dock.press({ key: 'fold:stats' })
  expect(await seen(/^DURÉE$/)).toEqual(['^DURÉE$', false])
  // Repliées, les statistiques tiennent en une ligne.
  expect(await seen(/^—  ·  —  ·  — tokens$/)).toEqual(['^—  ·  —  ·  — tokens$', true])
  expect(await seen(/▸ C O N F I G U R A T I O N/)).toEqual(['▸ C O N F I G U R A T I O N', true])
  expect(await seen(/^MODÈLE$/)).toEqual(['^MODÈLE$', false])
  expect(await seen(/effort/)).toEqual(['effort', true])
  expect(await seen(/^SEMAINE$/)).toEqual(['^SEMAINE$', false])
  expect(await seen(/^5 H $/)).toEqual(['^5 H $', true])

  await dock.press({ key: 'fold:config' })
  expect(await seen(/^MODÈLE$/)).toEqual(['^MODÈLE$', true])
  await dock.unmount()
})

test('les sections repliées le restent d’une session à l’autre', async ($, on) => {
  mock.clock(on, { now: T0 })
  quiet(on)
  mock.store(on, { closed: ['config'] })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', (_$, e) => ({ value: { tool: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const dock = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58), viewport: { columns: 200, rows: 60, isFullscreen: true } })
  await dock.drawn()
  expect(await dock.find({ text: /▸ C O N F I G U R A T I O N/ })).toBeDefined()
  expect(await dock.find({ text: /^MODÈLE$/ })).toBeUndefined()
  await dock.unmount()
})

test('repliée, l’activité garde la fenêtre de 5 h : sa fin et sa projection, en couleur', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  quiet(on)
  mock.store(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  const resetsAt = new Date(T0 + 120 * MIN).toISOString()
  const measure = (pct: number) => $.session.measure({ context: { window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt }], changed: ['rateLimits'] })
  await measure(40)
  await clock.advance(30 * MIN)
  await measure(60)
  const dock = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58), viewport: { columns: 200, rows: 60, isFullscreen: true } })
  await dock.press({ key: 'fold:activity' })
  await dock.drawn()
  // 20 points en 30 min : les 100 % tombent 1 h plus tard, avant la fin de la fenêtre.
  expect(await dock.find({ type: 'Text', text: /^5 H 60 % · fin 10:00 \(1 h 30\)$/ })).toBeDefined()
  // Une heure devant soi : ambre ; moins d'une demi-heure, ce serait le corail.
  expect((await dock.find({ type: 'Text', text: /^⚑ 100 % vers 09:30$/ }))?.props.color).toBe('ansi256(3)')
  await dock.unmount()
})

test('les numéros de version se comparent', () => {
  expect(releaseOf('v0.3.0')).toBe('0.3.0')
  expect(releaseOf('0.10.2')).toBe('0.10.2')
  expect(releaseOf('v1.0.0-beta')).toBeUndefined()
  expect(releaseOf(undefined)).toBeUndefined()
  expect(isNewer('0.2.1', '0.3.0')).toBe(true)
  expect(isNewer('0.9.0', '0.10.0')).toBe(true)
  expect(isNewer('0.3.0', '0.3.0')).toBe(false)
  expect(isNewer('1.0.0', '0.9.9')).toBe(false)
})

test('une version publiée plus récente s’annonce à côté du titre, et un toast le dit une fois', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  const toasts: string[] = []
  const asked: string[] = []
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.notify', () => ({ value: { isSent: false as const, reason: 'no-surface' as const } }))
  on('env.get', () => ({ value: undefined }))
  on('http.fetch', (_$, e) => {
    asked.push(e.url)
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ tag_name: 'v9.0.0' }) } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', (_$, e) => ({ value: { tool: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await clock.advance(20_000)
  const dock = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit', props: paneProps('dock', 58), viewport: { columns: 200, rows: 60, isFullscreen: true } })
  await dock.drawn()
  expect(await dock.find({ type: 'Text', text: / → v9\.0\.0$/ })).toBeDefined()
  expect(toasts.filter(t => t.includes('9.0.0'))).toHaveLength(1)
  expect(asked).toEqual(['https://api.github.com/repos/Happykiller/claude-cockpit/releases/latest'])
  await dock.unmount()
  // Une autre session le même jour : ni nouvelle requête, ni nouveau toast.
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await clock.advance(1000)
  expect(asked).toHaveLength(1)
  expect(toasts.filter(t => t.includes('9.0.0'))).toHaveLength(1)
})
