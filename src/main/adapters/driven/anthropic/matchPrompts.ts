import type {
  ReviewOutput, ReviewClaim, EvidenceRef, BenchmarkBasis,
  FramingOutput, NarrationOutput, HighlightNarration, DeathNarration, TurningPoint
} from '@shared/types'
import type {
  ReviewExtras, TasksExtras, TaskProposal, ReflectionExtras, ReflectionProposal,
  DiscoveryPlan, DiscoveryRequest
} from '../../../application/ports/MatchCoachingModel'
import type { GeneratedTask } from '../../../domain/report/focusTask'
import type { ProposedSemanticObject } from '../../../domain/memory/semanticObject'
import { isValidProposedObject } from '../../../domain/memory/semanticObject'
import { isComputable } from '../../../domain/report/metricRegistry'

// Pure prompt builders + validators for the per-match coaching passes. No SDK
// import here (that lives in AnthropicMatchCoachingModel). Each `parse*` coerces
// and validates a forced-tool payload and THROWS on anything unusable — mirroring
// parseSessionAnalysis. Catalog-membership of refs is enforced separately by the
// orchestrator (anchorCatalog.isValidStructuredRef), so these stay catalog-free.

const REF_KINDS = new Set(['stat', 'marker', 'benchmark', 'note'])
const BASES = new Set<string>(['champion_patch', 'rank_general', 'general'])

function nonEmpty(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

function parseRef(raw: unknown): EvidenceRef | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = nonEmpty(o.id)
  const kind = typeof o.kind === 'string' ? o.kind : ''
  if (!id || !REF_KINDS.has(kind)) return null
  const label = nonEmpty(o.label)
  return { id, kind: kind as EvidenceRef['kind'], ...(label ? { label } : {}) }
}

// ── Pass 3: overall review (prose verdict) ───────────────────────────────────

export const SUBMIT_REVIEW = {
  name: 'submit_review',
  description:
    'Return the overall review: a blunt prose verdict on why the game was won or lost, plus the structured claims behind it. Annotate only the facts in the context — never invent a number or a marker.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['verdict', 'improve', 'claims', 'cohort', 'benchmarkBasis', 'confidence'],
    properties: {
      verdict: {
        type: 'object',
        additionalProperties: false,
        required: ['lead', 'gild'],
        properties: {
          lead: { type: 'string', description: 'First sentence — the single decisive decision/pattern that won or lost the game.' },
          gild: { type: 'string', description: 'A short second clause that sharpens it. May be empty.' }
        }
      },
      improve: { type: 'string', description: 'One or two sentences on the single most important thing to change next game.' },
      claims: {
        type: 'array',
        maxItems: 6,
        description: 'The structured facts the verdict rests on. Each cites an anchor id from the context.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'ref'],
          properties: {
            text: { type: 'string' },
            ref: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'kind'],
              properties: {
                id: { type: 'string', description: 'An anchor id from the context, e.g. "stat:gold_at_24" or "marker:objective#2".' },
                kind: { type: 'string', enum: ['stat', 'marker', 'benchmark', 'note'] },
                label: { type: 'string' }
              }
            }
          }
        }
      },
      cohort: { type: 'string', description: 'Short basis label, e.g. "vs Ahri mid meta (patch 14.10)" or "vs general benchmark".' },
      benchmarkBasis: { type: 'string', enum: ['champion_patch', 'rank_general', 'general'] },
      confidence: { type: 'string', enum: ['established', 'provisional'] }
    }
  }
}

const REVIEW_SYSTEM = `You are Corky, a blunt high-elo League of Legends coach reviewing ONE of the player's games. Call submit_review with your read.

Your job: (1) in one or two sentences, name the single most important decision or pattern behind this win or loss — the thing that actually mattered; (2) in "improve", say in one or two sentences the single most important thing to change next game; (3) list the structured claims it rests on, each citing an anchor id from the context.

Hard rules:
- Annotate only the facts in the context. NEVER invent a number, a benchmark, or a timeline marker. Every claim's "ref.id" MUST be an id that appears in the context (a STAT or MARK line), unless its kind is "benchmark" or "note".
- The verdict is prose — blunt, specific, no hedging, no restating the scoreline.
- When you cite a rate (CS/min, deaths) against the benchmark, set benchmarkBasis to the basis in the BENCH line; if there is no BENCH line use "general".
- The player's goal/notes (NOTE lines) are their stated intent — speak to them where the data supports it, but never present them as your own evidence and never invent a figure to fit them.
- If the data can't support a firm conclusion (no timeline, a remake, a very short game), say so plainly and set confidence to "provisional".
- Be honest about limits. A short, true read beats a confident wrong one.`

function renderReviewExtras(extras: ReviewExtras): string {
  const parts: string[] = []
  if (extras.benchmark) {
    const b = extras.benchmark
    parts.push(`Benchmark: ${b.metric} = ${b.ref} (basis ${b.basis}${b.patch ? `, patch ${b.patch}` : ''}).`)
  }
  if (extras.framing) parts.push(`Framing read: ${extras.framing}`)
  if (extras.narration) parts.push(`Narration read: ${extras.narration}`)
  return parts.length ? `\n\n${parts.join('\n')}` : ''
}

export function buildReviewPrompt(ctx: string, extras: ReviewExtras): { system: string; user: string } {
  const user = `Game facts (annotate these; cite anchor ids):
${ctx}${renderReviewExtras(extras)}

Now call submit_review with the verdict and the claims behind it.`
  return { system: REVIEW_SYSTEM, user }
}

/** Validate + coerce the forced-tool payload into a ReviewOutput. Throws on anything unusable. */
export function parseReview(input: unknown): ReviewOutput {
  if (!input || typeof input !== 'object') throw new Error('Review model returned no payload')
  const o = input as Record<string, unknown>

  const v = o.verdict as Record<string, unknown> | undefined
  const lead = nonEmpty(v?.lead)
  if (!lead) throw new Error('Review is missing a verdict lead')
  const gild = typeof v?.gild === 'string' ? v.gild.trim() : ''
  const improve = typeof o.improve === 'string' ? o.improve.trim() : ''

  const rawClaims = Array.isArray(o.claims) ? o.claims : []
  const claims: ReviewClaim[] = []
  for (const rc of rawClaims) {
    if (!rc || typeof rc !== 'object') continue
    const text = nonEmpty((rc as Record<string, unknown>).text)
    const ref = parseRef((rc as Record<string, unknown>).ref)
    if (text && ref) claims.push({ text, ref })
  }

  const benchmarkBasis: BenchmarkBasis = BASES.has(String(o.benchmarkBasis))
    ? (o.benchmarkBasis as BenchmarkBasis)
    : 'general'

  return {
    verdict: { lead, gild },
    improve,
    claims,
    cohort: nonEmpty(o.cohort) ?? 'vs general benchmark',
    benchmarkBasis,
    confidence: o.confidence === 'provisional' ? 'provisional' : 'established'
  }
}

// ── Pass 1: caveats & framing (the decoration layer) ─────────────────────────

const TAG_INTENTS = ['win', 'loss', 'objective', 'accent', 'warn', 'info', 'neutral']

export const SUBMIT_FRAMING = {
  name: 'submit_framing',
  description:
    'Fill the small framing texts around the report (MVP-style label, headline tag, a one-line quick read, matchup tips), drawn only from the game stats. Factual, no coaching.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['headlineTag', 'headlineTagIntent', 'quickRead', 'mvp', 'matchupTips'],
    properties: {
      headlineTag: { type: 'string', description: 'A 1–3 word tag for the verdict card, e.g. "Baron 24:40" or "Clean snowball".' },
      headlineTagIntent: { type: 'string', enum: TAG_INTENTS },
      quickRead: { type: 'string', description: 'One factual sentence orienting the game.' },
      mvp: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['champion', 'isYou', 'teamId', 'justification'],
        description: 'The standout player from the visible scoreboard, or null on a remake/degenerate game.',
        properties: {
          champion: { type: 'string' },
          isYou: { type: 'boolean' },
          teamId: { type: 'number' },
          justification: { type: 'string', description: 'One short factual line grounded in the numbers.' }
        }
      },
      matchupTips: { type: 'array', maxItems: 3, items: { type: 'string' } }
    }
  }
}

const FRAMING_SYSTEM = `You are Corky, filling the small framing texts on a League of Legends match report. Call submit_framing.

These are lightweight decorations drawn ONLY from the game stats — a headline tag, a one-line quick read, the standout player (MVP), and up to three short matchup tips. Keep them factual and tight.

Hard rules:
- Use only the numbers in the context. NEVER invent a figure.
- The quick read is one sentence, factual, no coaching verdict (the verdict is a separate section).
- MVP is the standout from the scoreboard (either team) with a one-line justification from the numbers; set it to null for a remake / AFK / near-zero-duration game rather than inventing one.
- Matchup tips are short, factual notes about the lane pairing — no coaching prose.
- headlineTagIntent: "win"/"loss" for the result, "objective" for a game decided on an objective, else "neutral".`

export function buildFramingPrompt(ctx: string): { system: string; user: string } {
  return {
    system: FRAMING_SYSTEM,
    user: `Game facts:\n${ctx}\n\nNow call submit_framing with the small framing texts.`
  }
}

export function parseFraming(input: unknown): FramingOutput {
  if (!input || typeof input !== 'object') throw new Error('Framing model returned no payload')
  const o = input as Record<string, unknown>
  const headlineTag = nonEmpty(o.headlineTag)
  const quickRead = nonEmpty(o.quickRead)
  if (!headlineTag || !quickRead) throw new Error('Framing is missing required text')
  const intent = typeof o.headlineTagIntent === 'string' && TAG_INTENTS.includes(o.headlineTagIntent)
    ? (o.headlineTagIntent as FramingOutput['headlineTagIntent'])
    : 'neutral'

  let mvp: FramingOutput['mvp'] = null
  if (o.mvp && typeof o.mvp === 'object') {
    const m = o.mvp as Record<string, unknown>
    const champion = nonEmpty(m.champion)
    const justification = nonEmpty(m.justification)
    if (champion && justification) {
      mvp = { champion, isYou: m.isYou === true, teamId: Number(m.teamId) || 0, justification }
    }
  }

  const matchupTips = Array.isArray(o.matchupTips)
    ? o.matchupTips.map(nonEmpty).filter((s): s is string => !!s).slice(0, 3)
    : []

  const captions = o.captions && typeof o.captions === 'object'
    ? Object.fromEntries(
        Object.entries(o.captions as Record<string, unknown>)
          .filter(([, v]) => typeof v === 'string' && v.trim())
          .map(([k, v]) => [k, (v as string).trim()])
      )
    : undefined

  return { headlineTag, headlineTagIntent: intent, quickRead, mvp, matchupTips, ...(captions && Object.keys(captions).length ? { captions } : {}) }
}

// ── Pass 2: highlight & death narration ──────────────────────────────────────

const DEATH_CHARACTERS = ['caught_out', 'overextended', 'fair_fight', 'objective_trade', 'unclear']

export const SUBMIT_NARRATION = {
  name: 'submit_narration',
  description:
    'Narrate the marked moments: a short factual line per timeline highlight and per player death, plus the handful of turning points. Cite anchor ids; never invent a moment.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['highlightNarrations', 'deathNarrations', 'turningPoints'],
    properties: {
      highlightNarrations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'text'],
          properties: {
            ref: { type: 'object', required: ['id', 'kind'], additionalProperties: false, properties: { id: { type: 'string' }, kind: { type: 'string', enum: ['stat', 'marker', 'benchmark', 'note'] }, label: { type: 'string' } } },
            text: { type: 'string' }
          }
        }
      },
      deathNarrations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'character', 'text'],
          properties: {
            ref: { type: 'object', required: ['id', 'kind'], additionalProperties: false, properties: { id: { type: 'string' }, kind: { type: 'string', enum: ['stat', 'marker', 'benchmark', 'note'] }, label: { type: 'string' } } },
            character: { type: 'string', enum: DEATH_CHARACTERS },
            text: { type: 'string' }
          }
        }
      },
      turningPoints: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['time', 'swing', 'dir', 'what', 'better'],
          properties: {
            time: { type: 'string', description: 'mm:ss from a MARK line.' },
            swing: { type: 'string', description: 'e.g. "−1.6k swing".' },
            dir: { type: 'string', enum: ['up', 'down'] },
            you: { type: 'object', required: ['x', 'y'], additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' } } },
            event: { type: 'object', required: ['x', 'y'], additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' } } },
            objective: { type: 'object', required: ['x', 'y'], additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' } } },
            what: { type: 'string' },
            better: { type: 'string' }
          }
        }
      }
    }
  }
}

const NARRATION_SYSTEM = `You are Corky, narrating the marked moments of a League of Legends game. Call submit_narration.

For each MARK line in the context, write one short factual line of what happened and why it mattered. Characterise each player death (caught_out / overextended / fair_fight / objective_trade), and use "unclear" rather than guessing when the data can't say. Then pick the handful of moments where the advantage actually swung as turning points.

Hard rules:
- Every "ref.id" MUST be a MARK id from the context (a marker:... id). Do not narrate a moment that isn't marked.
- ALWAYS pick the 2–4 biggest turning points — the moments where the advantage actually swung — using the times and sides from the MARK lines (and the gold swing they caused). Do not return an empty turningPoints array when the game had objectives, team-wipes, or death-driven swings.
- Map positions (you/event/objective, 0–100) are OPTIONAL: include x/y only for player-death moments where the context gives them; otherwise omit the positions entirely. Never invent coordinates.
- Turning points carry a short "what happened" and a "better play" coaching line; everything else stays factual.`

export function buildNarrationPrompt(ctx: string): { system: string; user: string } {
  return {
    system: NARRATION_SYSTEM,
    user: `Game facts (narrate the MARK lines; cite their ids):\n${ctx}\n\nNow call submit_narration.`
  }
}

function clamp(n: unknown): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

function parsePos(raw: unknown): { x: number; y: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.x == null || o.y == null) return null
  return { x: clamp(o.x), y: clamp(o.y) }
}

export function parseNarration(input: unknown): NarrationOutput {
  if (!input || typeof input !== 'object') throw new Error('Narration model returned no payload')
  const o = input as Record<string, unknown>

  const highlightNarrations: HighlightNarration[] = []
  for (const raw of Array.isArray(o.highlightNarrations) ? o.highlightNarrations : []) {
    const text = nonEmpty((raw as Record<string, unknown>)?.text)
    const ref = parseRef((raw as Record<string, unknown>)?.ref)
    if (text && ref) highlightNarrations.push({ text, ref })
  }

  const deathNarrations: DeathNarration[] = []
  for (const raw of Array.isArray(o.deathNarrations) ? o.deathNarrations : []) {
    const r = raw as Record<string, unknown>
    const text = nonEmpty(r?.text)
    const ref = parseRef(r?.ref)
    const character = typeof r?.character === 'string' && DEATH_CHARACTERS.includes(r.character)
      ? (r.character as DeathNarration['character'])
      : 'unclear'
    if (text && ref) deathNarrations.push({ text, ref, character })
  }

  const turningPoints: TurningPoint[] = []
  for (const raw of Array.isArray(o.turningPoints) ? o.turningPoints : []) {
    const t = raw as Record<string, unknown>
    const time = nonEmpty(t?.time)
    const swing = nonEmpty(t?.swing)
    const what = nonEmpty(t?.what)
    const better = nonEmpty(t?.better)
    // Positions are a nice-to-have for the minimap snapshot — the text is the
    // value. The compact context only carries coords for player deaths, so
    // default missing positions to centre rather than dropping the moment.
    if (!time || !swing || !what || !better) continue
    const you = parsePos(t?.you) ?? { x: 50, y: 50 }
    const event = parsePos(t?.event) ?? { x: 50, y: 50 }
    const objective = parsePos(t?.objective)
    turningPoints.push({
      time, swing, dir: t.dir === 'up' ? 'up' : 'down', you, event, what, better,
      ...(objective ? { objective } : {})
    })
  }

  return { highlightNarrations, deathNarrations, turningPoints }
}

// ── Pass 4: focus tasks & the since-last loop ────────────────────────────────

const COMPARATORS = new Set(['>=', '<=', '==', '>', '<'])
const SCOPES = new Set(['champion', 'role', 'universal'])

export const SUBMIT_TASKS = {
  name: 'submit_tasks',
  description:
    'Maintain the standing set of 1–3 measurable focus tasks: hold tasks still in progress, retire resolved/stale ones, add new focus. Each task must use a computable metric.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['set', 'retire'],
    properties: {
      set: {
        type: 'array',
        maxItems: 3,
        description: 'The standing set after this game (the tasks to keep or add).',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'metric', 'comparator', 'target', 'scope'],
          properties: {
            description: { type: 'string', description: 'A concrete, checkable next-game task.' },
            metric: { type: 'string', description: 'One of the provided computable metric keys.' },
            comparator: { type: 'string', enum: ['>=', '<=', '==', '>', '<'] },
            target: { type: 'number' },
            scope: { type: 'string', enum: ['champion', 'role', 'universal'] },
            champion: { type: 'string' },
            role: { type: 'string' }
          }
        }
      },
      retire: { type: 'array', items: { type: 'string' }, description: 'Ids of standing tasks to retire.' }
    }
  }
}

const TASKS_SYSTEM = `You are Corky, maintaining a player's standing set of focus tasks across games. Call submit_tasks.

Keep a tight set of one to three concrete, measurable tasks. Hold tasks still being worked on, retire ones that are resolved or no longer the biggest leak, and add new focus from this game. Take the player's goal (NOTE line) into account.

Hard rules:
- Every task's "metric" MUST be one of the computable metric keys listed in the context. Do not invent a metric.
- Tasks are measurable: a metric + comparator + target the engine can check next game.
- Set "scope" to champion/role/universal; include champion or role when scoped.
- Never exceed three tasks. Fewer is fine when the data supports fewer honest tasks.
- Do not fabricate a task the goal or the game data don't support.`

export function buildTasksPrompt(ctx: string, extras: TasksExtras): { system: string; user: string } {
  const standing = extras.standing.length
    ? extras.standing.map((t) => `  - [${t.id}] ${t.description} (${t.metric} ${t.comparator} ${t.target}, ${t.scope})`).join('\n')
    : '  (none yet — this is the first analysed game)'
  const since = extras.sinceLast.length
    ? extras.sinceLast.map((e) => `  - ${e.description}: ${e.result}${e.actual ? ` (was ${e.actual})` : ''}`).join('\n')
    : '  (no prior tasks to evaluate)'
  const goal = extras.goal ? `\nPlayer goal: ${extras.goal}` : ''
  const user = `Game facts:
${ctx}

Computable metric keys: ${extras.catalogMetricKeys.join(', ')}
Current standing tasks:
${standing}
This game's result on them:
${since}${goal}

Now call submit_tasks with the standing set (1–3) and any ids to retire.`
  return { system: TASKS_SYSTEM, user }
}

// Coerce a raw `set`/`retire` payload into a TaskProposal, dropping any task that
// isn't well-formed and computable. Shared by pass 4 and the reflection finalize.
function parseTaskProposal(o: Record<string, unknown>): TaskProposal {
  const set: GeneratedTask[] = []
  for (const raw of Array.isArray(o.set) ? o.set : []) {
    const r = raw as Record<string, unknown>
    const description = nonEmpty(r?.description)
    const metric = typeof r?.metric === 'string' ? r.metric : ''
    const comparator = typeof r?.comparator === 'string' ? r.comparator : ''
    const target = Number(r?.target)
    const scope = typeof r?.scope === 'string' ? r.scope : ''
    if (!description || !isComputable(metric) || !COMPARATORS.has(comparator) || !Number.isFinite(target) || !SCOPES.has(scope)) continue
    const champion = nonEmpty(r?.champion)
    const role = nonEmpty(r?.role)
    if (scope === 'champion' && !champion) continue
    if (scope === 'role' && !role) continue
    set.push({
      description,
      metric,
      comparator: comparator as GeneratedTask['comparator'],
      target,
      scope: scope as GeneratedTask['scope'],
      ...(champion ? { champion } : {}),
      ...(role ? { role } : {})
    })
  }
  const retire = (Array.isArray(o.retire) ? o.retire : []).filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
  return { set: set.slice(0, 3), retire }
}

export function parseTasks(input: unknown): TaskProposal {
  if (!input || typeof input !== 'object') throw new Error('Tasks model returned no payload')
  return parseTaskProposal(input as Record<string, unknown>)
}

// ── Coaching chat + session reflection (spec 004) ────────────────────────────
// The chat is conversational (plain text), grounded in a per-game briefing the
// orchestrator supplies as the first user turn. The persona lives here; the facts
// come in via the briefing so this stays catalog-free and testable.

export const COACH_CHAT_SYSTEM = `You are Corky, a sharp but warm League of Legends coach talking 1:1 with the player right after a ranked game. The first message gives you the facts of THIS game and what the player is working on — coach off those facts, never generalities.

Style:
- Conversational and concise: 2 to 4 sentences per reply, like a real coach. Never an essay.
- Ask one focused question at a time and help them reach their own conclusions rather than lecturing.
- Reference the real facts of this game. Never invent a number, a death, or a moment that isn't in the brief.
- When the brief includes a DOSSIER section (data fetched for this question), ground your reply in it and cite its facts plainly.
- Plain text only — no markdown, no headers, no bullet lists, no emoji.
- Honest about limits. If the data can't settle something, say so.`

/** The chat transcript as Anthropic-shaped turns, briefing first. The renderer
 * persists the transcript; this just renders it for the API call. */
export function buildChatMessages(
  briefing: string,
  history: { role: 'user' | 'assistant'; text: string }[]
): { role: 'user' | 'assistant'; content: string }[] {
  return [
    { role: 'user', content: briefing },
    ...history.map((h) => ({ role: h.role, content: h.text }))
  ]
}

// ── Chat discovery: the data scout (spec 004 / A5) ───────────────────────────
// A bounded planning call before the chat reply: given the player's question and
// a one-line inventory, the LIGHT model requests only the fetches that would
// materially improve the answer. The command executes them; the model never
// fetches anything itself (Constitution II).

const DISCOVERY_KINDS = new Set(['memory', 'history', 'benchmark'])
const MAX_DISCOVERY_REQUESTS = 5

export const SUBMIT_PLAN = {
  name: 'submit_plan',
  description:
    "Request the data fetches that would materially improve the coach's answer to the player's question. An empty list is a good answer when the briefing already covers it.",
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['requests'],
    properties: {
      requests: {
        type: 'array',
        maxItems: 5,
        description: 'The fetches worth making — at most 5, usually 0 or 1.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind'],
          properties: {
            kind: { type: 'string', enum: ['memory', 'history', 'benchmark'] },
            query: { type: 'string', description: 'Short free-text search hint — only meaningful for kind "memory".' }
          }
        }
      }
    }
  }
}

const DISCOVERY_SYSTEM = `You are the data scout for a League of Legends coach answering ONE player question. Call submit_plan.

You get the question and an INVENTORY line of what is available: "memory" (durable coaching facts about this player; takes an optional free-text query), "history" (the player's own past games as a comparison cohort), "benchmark" (the public meta reference for this champion/role). Request ONLY what would materially improve the answer — an empty list is a good answer for questions the per-game briefing already covers. Never request a source the inventory shows as empty or off.`

export function buildDiscoveryPrompt(question: string, inventory: string): { system: string; user: string } {
  return {
    system: DISCOVERY_SYSTEM,
    user: `${inventory}\n\nPlayer question: ${question}\n\nNow call submit_plan with the fetches worth making (empty is fine).`
  }
}

/** Coerce the forced-tool payload into a DiscoveryPlan. Defensive, never throws
 * (a broken plan just means no dossier): unknown kinds are dropped, duplicates
 * (same kind+query) collapse, the list is capped at 5. */
export function parseDiscoveryPlan(input: unknown): DiscoveryPlan {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const requests: DiscoveryRequest[] = []
  const seen = new Set<string>()
  for (const raw of Array.isArray(o.requests) ? o.requests : []) {
    if (requests.length >= MAX_DISCOVERY_REQUESTS) break
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const kind = typeof r.kind === 'string' ? r.kind : ''
    if (!DISCOVERY_KINDS.has(kind)) continue
    const query = kind === 'memory' ? (nonEmpty(r.query) ?? undefined) : undefined
    const key = `${kind}|${query ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    requests.push({ kind: kind as DiscoveryRequest['kind'], ...(query ? { query } : {}) })
  }
  return { requests }
}

const MEMORY_KINDS = ['observation', 'pattern', 'strength', 'weakness', 'reflection', 'milestone']
const MEMORY_PHASES = new Set(['lane', 'mid', 'close'])

const SUBMIT_REFLECTION = {
  name: 'submit_reflection',
  description:
    "Write the player's post-game reflection from the conversation, optionally adjust their standing focus tasks if the talk warrants it, and distill at most 3 durable coaching facts worth remembering across games.",
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['reflection', 'set', 'retire', 'memory'],
    properties: {
      reflection: {
        type: 'string',
        description:
          "The reflection in the PLAYER'S first-person voice, as if they wrote it in their journal — 2 to 4 short sentences drawn from what THEY said: what they're taking away, and the one or two things they'll do differently. Plain text, no headers, no quotation marks."
      },
      set: {
        type: 'array',
        maxItems: 3,
        description:
          'ONLY brand-new focus tasks to ADD from this conversation — leave empty if nothing new came up. The current standing tasks are kept automatically; do NOT re-list them here. To remove a current task, put its id in "retire". Each new task uses a computable metric.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'metric', 'comparator', 'target', 'scope'],
          properties: {
            description: { type: 'string', description: 'A concrete, checkable next-game task.' },
            metric: { type: 'string', description: 'One of the provided computable metric keys.' },
            comparator: { type: 'string', enum: ['>=', '<=', '==', '>', '<'] },
            target: { type: 'number' },
            scope: { type: 'string', enum: ['champion', 'role', 'universal'] },
            champion: { type: 'string' },
            role: { type: 'string' }
          }
        }
      },
      retire: { type: 'array', items: { type: 'string' }, description: 'Ids of standing tasks to retire.' },
      memory: {
        type: 'array',
        maxItems: 3,
        description:
          'At most 3 durable, longitudinal coaching facts distilled from this session — facts worth remembering ACROSS games, not match recap. Return an EMPTY array when the session surfaced nothing durable (the common case).',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'statement'],
          properties: {
            kind: { type: 'string', enum: MEMORY_KINDS },
            champion: { type: 'string', description: 'Champion the fact is about, when champion-specific.' },
            role: { type: 'string', description: 'Role the fact is about, when role-specific.' },
            phase: { type: 'string', enum: ['lane', 'mid', 'close'] },
            metric: { type: 'string', description: 'Metric key the fact hinges on, when metric-specific.' },
            statement: { type: 'string', description: 'The durable coaching fact, phrased to stand alone without this match. At most 240 characters.' }
          }
        }
      }
    }
  }
}

export { SUBMIT_REFLECTION }

const REFLECTION_SYSTEM = `You are Corky, closing out a coaching session with the player. You have just talked through their game together. Call submit_reflection.

Three jobs:
1. Write the player's reflection in THEIR first-person voice, drawn from what THEY said in the conversation — not your verdict. 2 to 4 short sentences: what they're taking away and the one or two things they'll do differently next game. Plain text only.
2. Optionally adjust their focus tasks. The current standing tasks are KEPT automatically — you never need to re-list them. Only use "set" to ADD a brand-new task the conversation clearly surfaced, and "retire" to drop a current task by id. In most sessions you change nothing: return an EMPTY "set" and an EMPTY "retire".
3. Distill AT MOST 3 durable, longitudinal coaching facts from this session into "memory" — recurring behaviours, confirmed strengths or weaknesses, notable milestones. Phrase each statement so it stands alone without this match's context. When an EXISTING MEMORY entry (the MEMORY lines in the closing message) covers the same subject, restate it refreshed with what this session added rather than inventing a near-duplicate. Most sessions contain nothing durable: return an EMPTY "memory" array then.

Hard rules:
- The reflection is the PLAYER'S voice and their conclusions — never put words in their mouth or invent a number.
- Do NOT re-list existing tasks in "set" — that's only for new ones. Leaving "set" empty does NOT remove anything.
- Every new task's "metric" MUST be one of the computable metric keys listed. Do not invent a metric.
- Prefer stability: only add or retire a task the conversation actually justifies.
- Memory is for facts that will still matter games from now — never a one-off match recap, never an invented number.`

export function buildReflectionPrompt(
  briefing: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  extras: ReflectionExtras
): { system: string; messages: { role: 'user' | 'assistant'; content: string }[] } {
  const standing = extras.standing.length
    ? extras.standing
        .map((t) => `  - [${t.id}] ${t.description} (${t.metric} ${t.comparator} ${t.target}, ${t.scope})`)
        .join('\n')
    : '  (none yet)'
  const goal = extras.goal ? `\nThe player is working on: ${extras.goal}` : ''
  const memory = extras.existingMemory.length
    ? extras.existingMemory.map(renderMemoryLine).join('\n')
    : 'MEMORY none'
  const closing = `We're done talking. Now write my reflection from what I said, keep my focus tasks current, and update what you remember about me.

Computable metric keys: ${extras.catalogMetricKeys.join(', ')}
Current standing focus tasks:
${standing}${goal}
What you already remember about this player:
${memory}

Call submit_reflection.`
  return {
    system: REFLECTION_SYSTEM,
    messages: buildChatMessages(briefing, history).concat({ role: 'user', content: closing })
  }
}

/** Render one existing-memory entry as a compact MEMORY line for the closing
 * message, e.g. `MEMORY kind=pattern champ=ahri x3 "dies solo in river 14-20min"`. */
function renderMemoryLine(m: ReflectionExtras['existingMemory'][number]): string {
  const tags = [
    `kind=${m.kind}`,
    ...(m.champion ? [`champ=${m.champion}`] : []),
    ...(m.role ? [`role=${m.role}`] : []),
    ...(m.phase ? [`phase=${m.phase}`] : []),
    ...(m.metric ? [`metric=${m.metric}`] : [])
  ]
  return `MEMORY ${tags.join(' ')} x${m.occurrences} "${m.statement}"`
}

// Coerce the raw `memory` payload into proposed semantic objects, dropping any
// entry that isn't well-formed (isValidProposedObject) and tolerating the field
// missing entirely — an absent/empty array is the common "nothing durable" case.
function parseMemory(o: Record<string, unknown>): ProposedSemanticObject[] {
  const memory: ProposedSemanticObject[] = []
  for (const raw of Array.isArray(o.memory) ? o.memory : []) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const statement = nonEmpty(r.statement)
    if (!statement) continue
    const champion = nonEmpty(r.champion)
    const role = nonEmpty(r.role)
    const phase = typeof r.phase === 'string' && MEMORY_PHASES.has(r.phase) ? r.phase : null
    const metric = nonEmpty(r.metric)
    const candidate: ProposedSemanticObject = {
      kind: (typeof r.kind === 'string' ? r.kind : '') as ProposedSemanticObject['kind'],
      statement,
      ...(champion ? { champion } : {}),
      ...(role ? { role } : {}),
      ...(phase ? { phase: phase as ProposedSemanticObject['phase'] } : {}),
      ...(metric ? { metric } : {})
    }
    if (isValidProposedObject(candidate)) memory.push(candidate)
  }
  return memory.slice(0, 3)
}

export function parseReflection(input: unknown): ReflectionProposal {
  if (!input || typeof input !== 'object') throw new Error('Reflection model returned no payload')
  const o = input as Record<string, unknown>
  const reflection = nonEmpty(o.reflection)
  if (!reflection) throw new Error('Reflection model returned no reflection text')
  return { reflection, tasks: parseTaskProposal(o), memory: parseMemory(o) }
}
