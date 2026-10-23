import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { Activity, BgTask, Board, BoardStatus, BoardTone, ContextParts, Memory, Plan, PlanSummary, StepStatus } from '../types'
import { addTask, addUsage, applyBoard, arriveMode, boardAlerts, endedTasks, fmtDur, fmtRatio, fromTodos, isEnded, isNewer, measured, modeTracker, moveStep, ratioOf, readFooter, releaseOf, resumeBlocked, setPlan, settleFooter, summarize } from './model'
import type { BoardInput, PlanInput, Usage } from './model'
import { Band, Dock } from './view'
import { CHANGELOG_URL, LATEST_RELEASE_URL, MARKETPLACE, PLUGIN_ID, VERSION } from './version'

const PANE = 'cockpit'
const FAST_MS = 140
const IDLE_MS = 1000

const tick = atom({ plugin: 'cockpit', key: 'tick' } as const, { n: 0, now: 0 })
const activity = atom({ plugin: 'cockpit', key: 'activity' } as const, { limits: [], history: [], flow: [] } as Activity)
const plan = atom({ plugin: 'cockpit', key: 'plan' } as const, null as Plan | null)
const board = atom({ plugin: 'cockpit', key: 'board' } as const, null as Board | null)
const working = atom({ plugin: 'cockpit', key: 'working' } as const, false)
const bg = atom({ plugin: 'cockpit', key: 'bg' } as const, [] as BgTask[])
const memory = atom({ plugin: 'cockpit', key: 'memory' } as const, { count: 0, recent: [] } as Memory)
const closed = atom({ plugin: 'cockpit', key: 'closed' } as const, [] as string[])

/** Across sessions, in the plugin's store: the latest measured steps and finished plans. */
const SAMPLES = 'samples'
const PLANS = 'plans'
const CLOSED = 'closed'
/** The shift+tab cycle the footer has shown, so the next session starts knowing it. */
const CYCLE = 'cycle'
/** The latest release seen, when it was checked, and the one a toast announced. */
const LATEST = 'latest'
/** The dock's width the person chose as theirs, in body columns. */
const WIDTH = 'width'
const WIDTH_DEFAULT = 62
/** How long the dock's width stays on show after its last change. */
const RESIZE_MS = 3000
const CHECK_MS = 60 * 60_000
/** After a failed check, the next try. */
const RETRY_MS = 15 * 60_000
const KEEP_SAMPLES = 60
/** Every session writes to the same store: enough room that a busy one does not push out the others' plans. */
const KEEP_PLANS = 40

const STATUSES: readonly StepStatus[] = ['pending', 'in_progress', 'completed', 'blocked', 'skipped']
const BOARD_STATUSES: readonly BoardStatus[] = [...STATUSES, 'failed']
const TONES: readonly BoardTone[] = ['ok', 'warn', 'hot']

const GUIDE = `## Cockpit — plan d'exécution

L'opérateur suit ton avancement dans un cockpit affiché à côté de la conversation. Dès qu'un travail compte au moins trois étapes ou durera plus de quelques minutes, déclare-le d'abord avec \`mcp__cockpit__plan\` : une étape par jalon vérifiable, chacune avec ton estimation honnête de sa durée en minutes (\`estimate_min\`). Puis signale chaque transition avec \`mcp__cockpit__step\` : \`in_progress\` au moment où tu attaques l'étape (une étape close sans avoir été ouverte n'est pas chronométrée), \`completed\` quand elle est tenue, \`blocked\` quand tu attends l'opérateur, avec une note courte sur ce que tu fais. Quand l'opérateur a répondu, l'étape bloquée repart en \`in_progress\` ; clos-la avant de passer à la suivante. Si une estimation change nettement en cours de route, renvoie-la. Ces appels ne remplacent pas les comptes rendus à l'opérateur, et un sous-agent ne les fait pas.

Ne laisse jamais le plan figé. Avant ta réponse finale, clos l'étape en cours (\`completed\`, ou \`skipped\` si elle n'a pas été faite) : un plan fini se replie de lui-même. \`blocked\` veut dire que tu attends une réponse de l'opérateur pour continuer, jamais que le travail s'arrête. Si le travail s'arrête avant la fin du plan (l'opérateur te demande d'arrêter ou de fermer, ou passe à autre chose), passe l'étape en cours et toutes les étapes restantes en \`skipped\`, chacune avec une note qui dit où tu en es resté. Si l'opérateur t'a interrompu (Échap), y compris pendant une question, commence le tour suivant par remettre le plan d'aplomb.

## Cockpit — espace session

Le cockpit a un second bloc, distinct du plan : l'espace session, que tu remplis avec \`mcp__cockpit__board\` pour montrer à l'opérateur ce qui a du sens et que ton plan ne dit pas. Le plan reste ton propre travail, étape par étape ; ne le recopie pas dans l'espace session. Sers-t'en notamment quand tu orchestres un travail exécuté par d'autres (sous-agents, agents ouverts) : une entrée par lot ou par ticket avec son \`id\`, son exécutant (\`owner\`), son statut et une note, quelques chiffres clés (\`metrics\`), et une ligne de journal (\`event\`) à chaque fait marquant. Chaque appel complète l'espace (un \`id\` déjà vu met l'entrée à jour) ; \`reset\` repart de zéro, \`clear\` l'efface quand il n'a plus lieu d'être.`

// Module variables: what the next tick folds into the state. A reload loses
// them and the next event refills them; the state itself is the host's.
let timer: { cancel: () => void } | undefined
let isFast = false
let n = 0
let hintMode: string | undefined
let modes = modeTracker()
/** The cycle as last saved, so a learned step is saved once. */
let savedCycle = ''
let nextCheck = 0
let lastPoll = 0
/** The context fill that last raised the compaction alert, so it rings once per approach. */
let compactWarned = false
/** The dock's width as last drawn, when it last changed, and the width aimed at. */
let paneCols: number | undefined
let resizedAt = 0
let targetCols: number | undefined

const POLL_MS = 15_000

function startTimer($: EngineInterface, fast: boolean) {
  if (timer && fast === isFast) return
  timer?.cancel()
  isFast = fast
  timer = $.clock.every(fast ? FAST_MS : IDLE_MS, () => void beat($))
}

async function beat($: EngineInterface) {
  n += isFast ? 1 : 7
  const now = await $.clock.now()
  await $.state.set({ plugin: 'cockpit', key: 'tick' }, { n, now })
  const renewed = (await read($, activity)).limits?.some(l => l.resetsAt !== undefined && Date.parse(l.resetsAt) <= now && Date.parse(l.resetsAt) > lastPoll)
  if (now - lastPoll > POLL_MS || renewed) {
    lastPoll = now
    void $.session.usage().then(u => noteUsage($, u)).catch(() => undefined)
    void pruneAgents($).catch(() => undefined)
    void checkUpdate($, now).catch(() => undefined)
  }
  const pill = settleFooter(modes, Date.now())
  if (pill) hintMode = pill
  const cycle = JSON.stringify(modes.cycle)
  if (cycle !== savedCycle) {
    savedCycle = cycle
    void $.store.set(CYCLE, modes.cycle).catch(() => undefined)
  }
  const seen = hintMode
  if (seen !== undefined) {
    const a = await read($, activity)
    if (a.mode !== seen) await update($, activity, x => ({ ...x, mode: seen }))
  }
}

async function noteMode($: EngineInterface, mode: string | undefined) {
  if (!mode) return
  arriveMode(modes, mode)
  hintMode = undefined
  const a = await read($, activity)
  if (a.mode !== mode) await update($, activity, x => ({ ...x, mode }))
}

async function noteModel($: EngineInterface, model: string | undefined, effort: string | number | undefined) {
  const a = await read($, activity)
  const level = typeof effort === 'number' ? `${effort} tok` : effort
  if ((model && a.model !== model) || (level && a.effort !== level)) {
    await update($, activity, x => ({ ...x, model: model ?? x.model, effort: level ?? x.effort }))
  }
}

async function noteUsage($: EngineInterface, u: { context: SessionContextUsage; rateLimits: readonly SessionRateLimit[]; cost?: SessionCost; startedAt?: number }) {
  const now = await $.clock.now()
  await update($, activity, x => {
    const pct = u.context.percent
    const last = x.history.at(-1)
    const five = u.rateLimits.find(l => l.kind === 'five_hour')
    // A window is the one its end names; the reading of that end jitters by seconds.
    const sameWindow = five?.resetsAt !== undefined && x.trailFor !== undefined && Math.abs(Date.parse(five.resetsAt) - Date.parse(x.trailFor)) < 5 * 60_000
    const kept = sameWindow ? x.trail ?? [] : []
    const prev = kept.at(-1)
    // One reading every two minutes, or as soon as the figure moves: two hours of trail in 120.
    const isNew = five && (!prev || prev[1] !== five.percentUsed || now - prev[0] >= 2 * 60_000)
    const trail: [number, number][] = five ? (isNew ? [...kept, [now, five.percentUsed] as [number, number]].slice(-120) : kept) : x.trail ?? []
    return {
      ...x,
      trail,
      trailFor: five?.resetsAt ?? x.trailFor,
      contextTokens: u.context.tokens ?? x.contextTokens,
      contextWindow: u.context.window,
      contextPercent: pct ?? x.contextPercent,
      limits: u.rateLimits.length > 0 ? u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })) : x.limits,
      costUsd: u.cost?.usd ?? x.costUsd,
      startedAt: u.startedAt ?? x.startedAt,
      // A new start (/clear) begins a new tally.
      tokens: u.startedAt !== undefined && x.startedAt !== undefined && u.startedAt !== x.startedAt ? undefined : x.tokens,
      history: pct !== undefined && pct !== last ? [...x.history, pct].slice(-60) : x.history,
    }
  })
}

/** The window by category, as /context estimates it locally (no request sent). */
async function noteParts($: EngineInterface) {
  const { context } = await $.session.usage({ breakdown: 'summary' })
  const b = context.breakdown
  if (!b) return
  const parts: ContextParts = { system: 0, tools: 0, messages: 0, buffer: 0, max: b.rawMaxTokens || b.maxTokens, compactAt: b.isAutoCompactEnabled ? b.autoCompactThreshold : undefined }
  for (const c of b.categories) {
    if (c.kind === 'free' || c.kind === 'deferred') continue
    if (c.kind === 'buffer') parts.buffer += c.tokens
    else if (/message/i.test(c.name)) parts.messages += c.tokens
    else if (/tool/i.test(c.name)) parts.tools += c.tokens
    else parts.system += c.tokens
  }
  await update($, activity, x => ({ ...x, parts }))
}

/** One main-loop request answered: its context fill and its output, at once. */
async function noteStep($: EngineInterface, usage: Usage) {
  const tokens = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  await update($, activity, x => {
    const window = x.contextWindow
    const pct = window ? Math.round((tokens / window) * 100) : x.contextPercent
    return {
      ...x,
      contextTokens: tokens,
      contextPercent: pct,
      history: pct !== undefined && pct !== x.history.at(-1) ? [...x.history, pct].slice(-60) : x.history,
      // `flow` est né avec la refonte de style : un état conservé d'avant ne l'a pas.
      flow: [...(x.flow ?? []), usage.output_tokens].slice(-40),
    }
  })
  await warnCompaction($, tokens)
}

/** Any request answered, a subagent's too: the session's tally, as its cost counts them. */
async function noteTokens($: EngineInterface, usage: Usage) {
  await update($, activity, x => ({ ...x, tokens: addUsage(x.tokens, usage) }))
}

/** Rings once when the window comes within a tenth of the compaction threshold. */
async function warnCompaction($: EngineInterface, tokens: number) {
  const p = (await read($, activity)).parts
  const at = p?.compactAt ?? (p && p.buffer > 0 ? p.max - p.buffer : undefined)
  if (!at) return
  const isNear = tokens >= at * 0.9
  if (isNear && !compactWarned) {
    compactWarned = true
    $.ui.toast(`Cockpit : contexte à ${Math.round((tokens / at) * 100)} % du seuil de compaction`)
  }
  if (!isNear) compactWarned = false
}

// ── The plan's consequences: what it teaches, what it rings ──────────────

async function loadMemory($: EngineInterface) {
  const samples = ((await $.store.get(SAMPLES)) ?? []) as [number, number][]
  const sessionId = await $.session.id().catch(() => undefined)
  // The store holds every session's plans; the panel shows this one's.
  const recent = (((await $.store.get(PLANS)) ?? []) as PlanSummary[]).filter(p => p.sessionId !== undefined && p.sessionId === sessionId)
  await $.state.set({ plugin: 'cockpit', key: 'memory' }, { ratio: ratioOf(samples), count: samples.length, recent })
}

/** Writes the plan, then learns from the steps it closed and rings for what needs the operator. */
async function savePlan($: EngineInterface, prev: Plan | null, next: Plan | null) {
  await $.state.set({ plugin: 'cockpit', key: 'plan' }, next)
  if (!next) return
  const now = await $.clock.now()
  const fresh = measured(prev, next)
  if (fresh.length > 0) {
    const samples = [...(((await $.store.get(SAMPLES)) ?? []) as [number, number][]), ...fresh].slice(-KEEP_SAMPLES)
    await $.store.set(SAMPLES, samples)
  }
  if (next.finishedAt !== undefined && prev?.finishedAt === undefined) {
    const summary = { ...summarize(next, now), sessionId: await $.session.id().catch(() => undefined) }
    const plans = [summary, ...(((await $.store.get(PLANS)) ?? []) as PlanSummary[])].slice(0, KEEP_PLANS)
    await $.store.set(PLANS, plans)
    void notify($, `Plan « ${next.title} » terminé en ${fmtDur(summary.realMs)}`)
  }
  if (fresh.length > 0 || next.finishedAt !== undefined) await loadMemory($)
  next.steps.forEach(s => {
    const was = prev?.steps.find(p => p.id === s.id)
    if (s.status === 'blocked' && was?.status !== 'blocked') void notify($, `Étape ${s.id} bloquée : ${s.note ?? s.title}`)
  })
}

/** Folds a dock section or opens it again, and keeps the choice for the next sessions. */
async function toggleFold($: EngineInterface, id: string) {
  const next = await update($, closed, xs => (xs.includes(id) ? xs.filter(x => x !== id) : [...xs, id]))
  await $.store.set(CLOSED, next)
}

async function loadFolds($: EngineInterface) {
  const kept = await $.store.get(CLOSED)
  if (Array.isArray(kept)) await $.state.set({ plugin: 'cockpit', key: 'closed' }, kept.filter((x): x is string => typeof x === 'string'))
}

async function loadWidth($: EngineInterface) {
  const kept = await $.store.get(WIDTH)
  if (typeof kept === 'number' && Number.isInteger(kept) && kept > 0) targetCols = kept
}

/** `/cockpit largeur [n]`: the width aimed at, the dock's own when no number is given. */
async function setWidth($: EngineInterface, arg: string): Promise<string> {
  const cols = arg === '' ? paneCols : Number(arg)
  if (cols === undefined) return 'Cockpit : ouvre le panneau sur le côté, puis relance /cockpit largeur.'
  if (!Number.isInteger(cols) || cols < 20 || cols > 400) return `Cockpit : « ${arg} » n’est pas une largeur (un nombre de colonnes, de 20 à 400).`
  targetCols = cols
  await $.store.set(WIDTH, cols)
  return `Cockpit : largeur de référence ${cols} colonnes. En redimensionnant le panneau, sa largeur s’affiche en haut à droite, avec ✓ à ${cols}.`
}

async function notify($: EngineInterface, text: string) {
  $.ui.toast(text)
  await $.ui.notify(text, { title: 'Cockpit' }).catch(() => undefined)
}

// ── Work left running ───────────────────────────────────────────────────

function kindOf(type: string): BgTask['kind'] {
  if (type === 'shell') return 'shell'
  return type === 'subagent' ? 'agent' : 'other'
}

async function addBg($: EngineInterface, task: Omit<BgTask, 'startedAt'>) {
  const now = await $.clock.now()
  await update($, bg, xs => (xs.some(x => x.id === task.id) ? xs : [...xs, { ...task, startedAt: now }]))
}

async function dropBg($: EngineInterface, id: string) {
  await update($, bg, xs => xs.filter(x => x.id !== id))
}

/** The subagents still running, as the engine lists them: one it ended or dropped leaves, the others take its own description. */
async function pruneAgents($: EngineInterface) {
  if (!(await read($, bg)).some(x => x.kind === 'agent')) return
  const agents = await $.agent.list()
  await update($, bg, xs => xs.flatMap(x => {
    if (x.kind !== 'agent') return [x]
    const a = agents.find(y => y.id === x.id)
    return !a || isEnded(a.status) ? [] : [{ ...x, label: a.description || x.label }]
  }))
}

async function refresh($: EngineInterface) {
  const [usage, model, settings, tz] = await Promise.all([
    $.session.usage(),
    $.session.model(),
    $.settings.read(),
    $.process.run(['date', '+%z'], { timeoutMs: 2000 }).catch(() => undefined),
  ])
  await noteUsage($, usage)
  void noteParts($)
  const effort = typeof settings.effortLevel === 'string' ? settings.effortLevel : undefined
  const a = await read($, activity)
  await noteModel($, model, a.effort ?? effort)
  const m = /([+-])(\d{2})(\d{2})/.exec(tz?.stdout ?? '')
  if (m) {
    const offset = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
    await update($, activity, x => ({ ...x, tzOffsetMin: offset }))
  }
}

async function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Cockpit', rows: 14, columns: targetCols ?? WIDTH_DEFAULT })
}

function asText(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

function asMinutes(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined
}

type Latest = { version?: string; checkedAt: number; toasted?: string }

/**
 * Once an hour at most, all sessions together: the latest GitHub Release. Newer
 * than the one running, it shows beside the title, and a toast says it once.
 */
async function checkUpdate($: EngineInterface, now: number) {
  if (now < nextCheck) return
  nextCheck = now + RETRY_MS
  if (await $.env.get('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC')) return
  let seen = (await $.store.get(LATEST)) as Latest | undefined
  if (!seen || now - seen.checkedAt >= CHECK_MS) {
    const res = await $.http.fetch(LATEST_RELEASE_URL, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'claude-cockpit' } })
    // 404 until the first release: checked all the same.
    if (!res.ok && res.status !== 404) return
    const version = res.ok ? releaseOf((JSON.parse(res.text) as { tag_name?: unknown }).tag_name) : undefined
    seen = { ...seen, version: version ?? seen?.version, checkedAt: now }
  }
  nextCheck = seen.checkedAt + CHECK_MS
  const latest = seen.version !== undefined && isNewer(VERSION, seen.version) ? seen.version : undefined
  if (latest && seen.toasted !== latest) {
    seen = { ...seen, toasted: latest }
    $.ui.toast(`Cockpit ${latest} est disponible · /cockpit update`)
  }
  await $.store.set(LATEST, seen)
  if ((await read($, activity)).latest !== latest) await update($, activity, x => ({ ...x, latest }))
}

/**
 * `/cockpit update`: the two `claude plugin` commands a terminal would run.
 * The new version loads on /reload-plugins; the session keeps this one till then.
 */
async function selfUpdate($: EngineInterface): Promise<string> {
  const byHand = `Dans un terminal : claude plugin marketplace update ${MARKETPLACE} && claude plugin update ${PLUGIN_ID}`
  const said = (r: { stdout: string; stderr: string }) =>
    (r.stdout + '\n' + r.stderr).replace(/\x1b\[[0-9;]*m/g, '').split('\n').map(l => l.trim()).filter(Boolean).pop() ?? ''
  try {
    $.ui.toast('Cockpit : recherche de la dernière version…')
    const market = await $.process.run(['claude', 'plugin', 'marketplace', 'update', MARKETPLACE], { timeoutMs: 120_000 })
    if (market.exitCode !== 0) return `Cockpit : la marketplace n'a pas pu être mise à jour (${said(market)}).\n${byHand}`
    const plugin = await $.process.run(['claude', 'plugin', 'update', PLUGIN_ID], { timeoutMs: 120_000 })
    if (plugin.exitCode !== 0) return `Cockpit : la mise à jour a échoué (${said(plugin)}).\n${byHand}`
    nextCheck = 0
    if (/already/i.test(plugin.stdout)) {
      const onDisk = releaseOf(/\((\d+\.\d+\.\d+)\)/.exec(plugin.stdout)?.[1])
      if (!onDisk) return 'Cockpit : déjà à jour.'
      return onDisk === VERSION ? `Cockpit : ${VERSION} est la dernière version.` : `Cockpit : ${onDisk} est déjà installée. Lance /reload-plugins pour la charger.`
    }
    return `${said(plugin).replace(/\s*Restart to apply changes\.?$/i, '')}\nLance /reload-plugins pour charger la nouvelle version.`
  } catch (err) {
    return `Cockpit : la mise à jour n'a pas pu se lancer (${err instanceof Error ? err.message : String(err)}).\n${byHand}`
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const cycle = (await $.store.get(CYCLE).catch(() => undefined)) as Record<string, string> | undefined
    modes = modeTracker(cycle)
    savedCycle = JSON.stringify(modes.cycle)
    nextCheck = 0
    void $.clock.now().then(now => checkUpdate($, now)).catch(() => undefined)
    await $.command.register({
      name: 'cockpit',
      description: 'Ouvre le cockpit : activité de la session, frise du plan et espace session (« /cockpit reset » efface le plan et l’espace session, « /cockpit version » donne la version, « /cockpit update » met à jour, « /cockpit largeur [n] » fixe la largeur de référence du panneau)',
    })
    await $.tool.register({
      name: 'plan',
      description:
        "Déclare (ou complète) le plan d'exécution affiché dans le cockpit de l'opérateur : un titre et des étapes, chacune avec ton estimation de durée en minutes. `mode: \"append\"` ajoute des étapes au plan en cours au lieu de le remplacer.",
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Le nom court du travail (ex. « P09 E5 — corps et trajets »)' },
          steps: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: "L'étape, en quelques mots" },
                estimate_min: { type: 'number', description: 'Ton estimation honnête de sa durée, en minutes' },
              },
              required: ['title', 'estimate_min'],
            },
          },
          mode: { type: 'string', enum: ['replace', 'append'] },
        },
        required: ['title', 'steps'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'step',
      description:
        "Signale au cockpit la transition d'une étape du plan (numéro à partir de 1) : in_progress quand tu l'attaques, completed quand elle est tenue, blocked quand tu attends l'opérateur, skipped si elle est abandonnée. `note` dit en une ligne ce que tu fais ; `estimate_min` révise l'estimation.",
      inputSchema: {
        type: 'object',
        properties: {
          step: { type: 'integer', minimum: 1 },
          status: { type: 'string', enum: [...STATUSES] },
          note: { type: 'string' },
          estimate_min: { type: 'number' },
        },
        required: ['step', 'status'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'board',
      description:
        "Tient l'espace session du cockpit, un bloc distinct du plan : ce que tu veux montrer à l'opérateur pour suivre une activité, en particulier un travail que d'autres exécutent (sous-agents, agents ouverts). Chaque appel complète l'espace : `items` ajoute ou met à jour des entrées par `id`, `metrics` des chiffres clés par `label` (valeur vide = retirée), `event` ajoute une ligne datée au journal, `remove` retire des entrées. `reset` repart d'un espace vide, `clear` l'efface.",
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: "Le nom de ce que l'espace suit (ex. « PHAR — sprint 14, orchestration »)" },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Ta clé stable pour cette entrée (ex. « PHAR-12 », « lot-3 »)' },
                title: { type: 'string' },
                status: { type: 'string', enum: [...BOARD_STATUSES] },
                owner: { type: 'string', description: "Qui l'exécute : agent, personne, service" },
                note: { type: 'string', description: 'Où il en est, en une ligne' },
                progress: { type: 'number', minimum: 0, maximum: 100, description: 'Avancement en %, si tu le connais' },
              },
              required: ['id'],
            },
          },
          metrics: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                value: { type: ['string', 'number'] },
                tone: { type: 'string', enum: [...TONES], description: 'ok, warn (à surveiller) ou hot (alerte)' },
              },
              required: ['label', 'value'],
            },
          },
          event: { type: 'string', description: 'Une ligne pour le journal, datée par le cockpit' },
          event_tone: { type: 'string', enum: [...TONES] },
          remove: { type: 'array', items: { type: 'string' } },
          reset: { type: 'boolean' },
          clear: { type: 'boolean' },
        },
      },
      isDeferred: false,
    })
    await refresh($).catch(() => undefined)
    await loadMemory($).catch(() => undefined)
    await loadFolds($).catch(() => undefined)
    await loadWidth($).catch(() => undefined)
    startTimer($, false)
    void openPane($)
    return next(e)
  })

  on('command.run', { command: 'cockpit' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'reset') {
      await $.state.set({ plugin: 'cockpit', key: 'plan' }, null)
      await $.state.set({ plugin: 'cockpit', key: 'board' }, null)
      return { text: 'Cockpit : plan et espace session effacés.' }
    }
    if (arg === 'version') {
      const { latest } = await read($, activity)
      const how = latest
        ? `\nLa ${latest} est disponible : /cockpit update, puis /reload-plugins.`
        : ''
      const auto = '\nMise à jour automatique : /plugin → Marketplaces → claude-cockpit → Enable auto-update.'
      return { text: `Cockpit ${VERSION} · nouveautés : ${CHANGELOG_URL}${how}${auto}` }
    }
    if (arg === 'update') return { text: await selfUpdate($) }
    if (arg === 'largeur' || arg.startsWith('largeur ')) return { text: await setWidth($, arg.slice('largeur'.length).trim()) }
    if (arg === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Cockpit fermé.' }
    }
    await refresh($).catch(() => undefined)
    const opened = await openPane($)
    return { text: opened.isPlaced ? 'Cockpit ouvert.' : `Cockpit ouvert, en attente : ${opened.reason}` }
  })

  // ── What the model is told ────────────────────────────────────────────
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const m = await read($, memory)
    const lesson = m.ratio === undefined ? '' : `\n\nTes estimations passées, mesurées par le cockpit sur ${m.count} étapes : le temps réel vaut ${fmtRatio(m.ratio)} ton estimation. Corrige tes nouvelles estimations en conséquence.`
    return { sections: [...composed.sections, { id: 'cockpit:plan', text: GUIDE + lesson, scope: 'session' as const }] }
  })

  // ── The activity ──────────────────────────────────────────────────────
  on('session.measure', async ($, e, next) => {
    await noteUsage($, e)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) void noteModel($, e.model, e.effort)
    const answered = yield* next(e)
    if (answered.usage) {
      const usage = answered.usage
      void noteTokens($, usage).then(() => (e.agentId === undefined ? noteStep($, usage) : undefined)).catch(() => undefined)
    }
    return answered
  })

  on('turn.start', async ($, e, next) => {
    await $.state.set({ plugin: 'cockpit', key: 'working' }, true)
    startTimer($, true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await $.state.set({ plugin: 'cockpit', key: 'working' }, false)
      startTimer($, false)
      void refresh($).catch(() => undefined)
      void pruneAgents($).catch(() => undefined)
    }
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await noteMode($, e.permission_mode)
    if (e.agent_id === undefined) {
      const current = await read($, plan)
      const resumed = current && resumeBlocked(current, await $.clock.now())
      if (resumed && resumed !== current) await savePlan($, current, resumed)
    }
    return next(e)
  }).catch(($, e, next) => next(e))
  on('classic.PostToolUse', async ($, e, next) => {
    if (e.agent_id === undefined) {
      await noteMode($, e.permission_mode)
      if (e.effort?.level) void noteModel($, undefined, e.effort.level)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // shift+tab shows in the footer's reads (see readFooter); a drawing never
  // writes, so the next tick carries the mode into the state.
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    const seen = readFooter(modes, e.props.hint, Date.now())
    if (seen) hintMode = seen
    return next(e)
  })

  // ── The plan: the cockpit's own tools ─────────────────────────────────
  on('tool.call', { tool: 'mcp__cockpit__plan' }, async ($, e) => {
    const steps = Array.isArray(e.steps) ? e.steps : []
    const input: PlanInput = {
      title: asText(e.title),
      mode: e.mode === 'append' ? 'append' : 'replace',
      steps: steps.flatMap(s => {
        const o = (s ?? {}) as Record<string, unknown>
        const title = asText(o.title)
        return title ? [{ title, estimate_min: asMinutes(o.estimate_min) }] : []
      }),
    }
    if (input.steps.length === 0) return { deny: 'cockpit : le plan doit compter au moins une étape titrée.' }
    const now = await $.clock.now()
    const prev = await read($, plan)
    const next = setPlan(prev, input, now)
    await savePlan($, prev, next)
    const total = next.steps.reduce((sum, s) => sum + (s.estimateMin ?? 0), 0)
    return { result: `Plan « ${next.title} » affiché : ${next.steps.length} étapes, ~${total} min estimées. Signale chaque transition avec mcp__cockpit__step.` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'cockpit : le suivi du plan a échoué.' }))

  on('tool.call', { tool: 'mcp__cockpit__step' }, async ($, e) => {
    const current = await read($, plan)
    if (!current) return { deny: "cockpit : aucun plan en cours ; déclare-le d'abord avec mcp__cockpit__plan." }
    const index = typeof e.step === 'number' ? Math.round(e.step) - 1 : -1
    const status = STATUSES.find(s => s === e.status)
    if (!status || !current.steps[index]) return { deny: `cockpit : étape ${String(e.step)} ou statut ${String(e.status)} inconnu (1 à ${current.steps.length}).` }
    const now = await $.clock.now()
    const moved = moveStep(current, index, status, now, { note: asText(e.note), estimateMin: asMinutes(e.estimate_min) })
    await savePlan($, current, moved)
    return { result: `Étape ${index + 1} : ${status}.` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'cockpit : le suivi du plan a échoué.' }))

  // ── The session space: the cockpit's third tool ──────────────────────
  on('tool.call', { tool: 'mcp__cockpit__board' }, async ($, e) => {
    if (e.clear === true) {
      await $.state.set({ plugin: 'cockpit', key: 'board' }, null)
      return { result: 'Espace session effacé.' }
    }
    const tones = (v: unknown) => TONES.find(t => t === v)
    const list = (v: unknown) => (Array.isArray(v) ? v.map(x => (x ?? {}) as Record<string, unknown>) : [])
    // Unlike asText, an empty string stays: it takes the field off.
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined)
    const event = asText(e.event)
    const input: BoardInput = {
      title: asText(e.title),
      reset: e.reset === true,
      remove: Array.isArray(e.remove) ? e.remove.flatMap(x => asText(x) ?? []) : undefined,
      items: list(e.items).flatMap(o => {
        const id = asText(o.id) ?? (typeof o.id === 'number' ? String(o.id) : undefined)
        if (!id) return []
        return [{
          id,
          title: asText(o.title),
          status: BOARD_STATUSES.find(s => s === o.status),
          owner: text(o.owner),
          note: text(o.note),
          progress: typeof o.progress === 'number' && Number.isFinite(o.progress) ? o.progress : undefined,
        }]
      }),
      metrics: list(e.metrics).flatMap(o => {
        const label = asText(o.label)
        const value = typeof o.value === 'number' ? String(o.value) : text(o.value)
        return label && value !== undefined ? [{ label, value, tone: tones(o.tone) }] : []
      }),
      event: event ? { text: event, tone: tones(e.event_tone) } : undefined,
    }
    const now = await $.clock.now()
    const prev = await read($, board)
    const next = applyBoard(prev, input, now)
    await $.state.set({ plugin: 'cockpit', key: 'board' }, next)
    for (const s of boardAlerts(prev, next)) {
      void notify($, `${s.status === 'failed' ? 'Échec' : 'Bloqué'} · ${s.id} ${s.title}${s.note ? ` : ${s.note}` : ''}`)
    }
    return { result: `Espace session « ${next.title} » à jour : ${next.items.length} entrées, ${next.metrics.length} chiffres, ${next.log.length} lignes de journal.` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: "cockpit : la mise à jour de l'espace session a échoué." }))

  // ── The plan: the engine's task tools, where the session has them ─────
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) {
      const now = await $.clock.now()
      const prev = await read($, plan)
      if (prev?.source !== 'cockpit') await savePlan($, prev, fromTodos(prev, e.todos, now))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError && e.agentId === undefined) {
      const prev = await read($, plan)
      if (prev?.source !== 'cockpit') {
        const meta = (e.metadata ?? {}) as Record<string, unknown>
        const now = await $.clock.now()
        await $.state.set({ plugin: 'cockpit', key: 'plan' }, addTask(prev, ran.result.task.id, e.subject, asMinutes(meta.estimate_min), now))
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) {
      const prev = await read($, plan)
      const index = prev?.source === 'tasks' ? prev.steps.findIndex(s => s.id === e.taskId) : -1
      if (prev && index >= 0) {
        const now = await $.clock.now()
        const meta = (e.metadata ?? {}) as Record<string, unknown>
        let moved: Plan = prev
        if (e.status === 'deleted') moved = { ...prev, steps: prev.steps.filter((_, i) => i !== index) }
        else {
          if (e.status) moved = moveStep(moved, index, e.status, now, { note: e.activeForm })
          const est = asMinutes(meta.estimate_min)
          if (est !== undefined || e.subject) {
            moved = { ...moved, steps: moved.steps.map((s, i) => (i === index ? { ...s, title: e.subject ?? s.title, estimateMin: est ?? s.estimateMin } : s)) }
          }
        }
        await savePlan($, prev, moved)
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  // ── Work left running ─────────────────────────────────────────────────
  // The turn's end lists it whole; between two, a spawn adds and a subagent's end removes.
  on('classic.Stop', async ($, e, next) => {
    const now = await $.clock.now()
    const listed = e.background_tasks ?? []
    await update($, bg, xs => listed.map(t => {
      const known = xs.find(x => x.id === t.id)
      return known ?? { id: t.id, kind: kindOf(t.type), label: t.description || t.command || t.agent_type || t.name || t.type, startedAt: now }
    }))
    return next(e)
  }).catch(($, e, next) => next(e))

  // A background task's end reaches the session as a notification: it leaves at once, not at the turn's end.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'task-notification') {
      const ended = endedTasks(e.text)
      if (ended.length > 0) await update($, bg, xs => xs.filter(x => !ended.includes(x.id)))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A new session, a resumed or a cleared one, starts with nothing running.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source !== 'compact') await $.state.set({ plugin: 'cockpit', key: 'bg' }, [])
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStart', async ($, e, next) => {
    await addBg($, { id: e.agent_id, kind: 'agent', label: e.agent_type })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', async ($, e, next) => {
    await dropBg($, e.agent_id)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const id = ran.deny === undefined && !ran.isError ? ran.result?.backgroundTaskId : undefined
    if (id) await addBg($, { id, kind: 'shell', label: e.description ?? e.command })
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const ran = await next(e)
    const id = (e as { task_id?: unknown; shell_id?: unknown }).task_id ?? (e as { shell_id?: unknown }).shell_id
    if (ran.deny === undefined && typeof id === 'string') await dropBg($, id)
    return ran
  }).catch(($, e, next) => next(e))

  // A section title pressed, by a click or its digit: the section folds or opens.
  on('ui.press', async ($, e, next) => {
    if (e.plugin === 'cockpit' && e.requestId === PANE && e.element.startsWith('fold:')) await toggleFold($, e.element.slice('fold:'.length))
    return next(e)
  }).catch(($, e, next) => next(e))

  // ── The drawing ───────────────────────────────────────────────────────
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const E = $.ui.resolve(e)
    const [t, stored, p, b, w, tasks, folded] = await Promise.all([read($, tick), read($, activity), read($, plan), read($, board), read($, working), read($, bg), read($, closed)])
    // Un état conservé par une version antérieure du mod peut manquer d'un champ né depuis.
    const a: Activity = { ...stored, limits: stored.limits ?? [], history: stored.history ?? [], flow: stored.flow ?? [] }
    const now = t.now || (await $.clock.now())
    const cols = e.props.bodyColumns
    if (e.props.placement === 'dock' && cols !== paneCols) {
      if (paneCols !== undefined) resizedAt = now
      paneCols = cols
    }
    const d = {
      activity: a,
      history: a.history,
      plan: p,
      board: b ?? null,
      n: t.n,
      now,
      working: w,
      bg: tasks ?? [],
      closed: folded ?? [],
      tz: a.tzOffsetMin ?? 0,
      cols,
      rows: e.props.scroll.bodyRows,
      resize: now - resizedAt < RESIZE_MS ? { target: targetCols ?? WIDTH_DEFAULT } : undefined,
    }
    return e.props.placement === 'dock' ? <Dock E={E} d={d} /> : <Band E={E} d={d} />
  })
}
