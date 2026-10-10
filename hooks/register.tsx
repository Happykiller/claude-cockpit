import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { Activity, Plan, StepStatus } from '../types'
import { addTask, fromTodos, modeFromHint, moveStep, setPlan } from './model'
import type { PlanInput } from './model'
import { Band, Dock } from './view'

const PANE = 'cockpit'
const FAST_MS = 140
const IDLE_MS = 1000

const tick = atom({ plugin: 'cockpit', key: 'tick' } as const, { n: 0, now: 0 })
const activity = atom({ plugin: 'cockpit', key: 'activity' } as const, { limits: [], history: [] } as Activity)
const plan = atom({ plugin: 'cockpit', key: 'plan' } as const, null as Plan | null)
const working = atom({ plugin: 'cockpit', key: 'working' } as const, false)

const STATUSES: readonly StepStatus[] = ['pending', 'in_progress', 'completed', 'blocked', 'skipped']

const GUIDE = `## Cockpit — plan d'exécution

L'opérateur suit ton avancement dans un cockpit affiché à côté de la conversation. Dès qu'un travail compte au moins trois étapes ou durera plus de quelques minutes, déclare-le d'abord avec \`mcp__cockpit__plan\` : une étape par jalon vérifiable, chacune avec ton estimation honnête de sa durée en minutes (\`estimate_min\`). Puis signale chaque transition avec \`mcp__cockpit__step\` : \`in_progress\` quand tu attaques l'étape, \`completed\` quand elle est tenue, \`blocked\` quand tu attends l'opérateur, avec une note courte sur ce que tu fais. Si une estimation change nettement en cours de route, renvoie-la. Ces appels ne remplacent pas les comptes rendus à l'opérateur, et un sous-agent ne les fait pas.`

// Module variables: what the next tick folds into the state. A reload loses
// them and the next event refills them; the state itself is the host's.
let timer: { cancel: () => void } | undefined
let isFast = false
let n = 0
let hintMode: string | undefined

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
  const seen = hintMode
  if (seen !== undefined) {
    const a = await read($, activity)
    if (a.mode !== seen) await update($, activity, x => ({ ...x, mode: seen }))
  }
}

async function noteMode($: EngineInterface, mode: string | undefined) {
  if (!mode) return
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
  await update($, activity, x => {
    const pct = u.context.percent
    const last = x.history.at(-1)
    return {
      ...x,
      contextTokens: u.context.tokens ?? x.contextTokens,
      contextWindow: u.context.window,
      contextPercent: pct ?? x.contextPercent,
      limits: u.rateLimits.length > 0 ? u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })) : x.limits,
      costUsd: u.cost?.usd ?? x.costUsd,
      startedAt: u.startedAt ?? x.startedAt,
      history: pct !== undefined && pct !== last ? [...x.history, pct].slice(-60) : x.history,
    }
  })
}

async function refresh($: EngineInterface) {
  const [usage, model, settings, tz] = await Promise.all([
    $.session.usage(),
    $.session.model(),
    $.settings.read(),
    $.process.run(['date', '+%z'], { timeoutMs: 2000 }).catch(() => undefined),
  ])
  await noteUsage($, usage)
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
  return $.ui.open({ id: PANE, title: 'Cockpit', rows: 14, columns: 62 })
}

function asText(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

function asMinutes(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cockpit',
      description: 'Ouvre le cockpit : activité de la session et frise du plan (« /cockpit reset » efface le plan)',
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
    await refresh($).catch(() => undefined)
    startTimer($, false)
    void openPane($)
    return next(e)
  })

  on('command.run', { command: 'cockpit' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'reset') {
      await $.state.set({ plugin: 'cockpit', key: 'plan' }, null)
      return { text: 'Cockpit : plan effacé.' }
    }
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
    return { sections: [...composed.sections, { id: 'cockpit:plan', text: GUIDE, scope: 'session' as const }] }
  })

  // ── The activity ──────────────────────────────────────────────────────
  on('session.measure', async ($, e, next) => {
    await noteUsage($, e)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) void noteModel($, e.model, e.effort)
    return yield* next(e)
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
    }
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await noteMode($, e.permission_mode)
    return next(e)
  }).catch(($, e, next) => next(e))
  on('classic.PostToolUse', async ($, e, next) => {
    if (e.agent_id === undefined) {
      await noteMode($, e.permission_mode)
      if (e.effort?.level) void noteModel($, undefined, e.effort.level)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The footer names the mode the moment shift+tab changes it; a drawing
  // never writes, so the next tick carries it into the state.
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    const seen = modeFromHint(e.props.hint)
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
    await $.state.set({ plugin: 'cockpit', key: 'plan' }, next)
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
    await $.state.set({ plugin: 'cockpit', key: 'plan' }, moved)
    return { result: `Étape ${index + 1} : ${status}.` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'cockpit : le suivi du plan a échoué.' }))

  // ── The plan: the engine's task tools, where the session has them ─────
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) {
      const now = await $.clock.now()
      const prev = await read($, plan)
      if (prev?.source !== 'cockpit') await $.state.set({ plugin: 'cockpit', key: 'plan' }, fromTodos(prev, e.todos, now))
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
        await $.state.set({ plugin: 'cockpit', key: 'plan' }, moved)
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  // ── The drawing ───────────────────────────────────────────────────────
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const E = $.ui.resolve(e)
    const [t, a, p, w] = await Promise.all([read($, tick), read($, activity), read($, plan), read($, working)])
    const d = {
      activity: a,
      history: a.history,
      plan: p,
      n: t.n,
      now: t.now || (await $.clock.now()),
      working: w,
      tz: a.tzOffsetMin ?? 0,
      cols: e.props.bodyColumns,
    }
    return e.props.placement === 'dock' ? <Dock E={E} d={d} /> : <Band E={E} d={d} />
  })
}
