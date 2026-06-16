import type {
  ReviewOutput, ReviewClaim, EvidenceRef, BenchmarkBasis,
  FramingOutput, NarrationOutput, HighlightNarration, DeathNarration, TurningPoint
} from '@shared/types'
import type {
  ReviewExtras, TasksExtras, TaskProposal,
  DiscoveryPlan, DiscoveryRequest, AgenticChatExtras
} from '../../../application/ports/MatchCoachingModel'
import type { GeneratedTask } from '../../../domain/report/focusTask'
import type { RawProposal } from '../../../domain/chat/proposal'
import type { ProposedSemanticObject } from '../../../domain/memory/semanticObject'
import { isValidProposedObject } from '../../../domain/memory/semanticObject'
import { isComputable } from '../../../domain/report/metricRegistry'
import type { PromptId } from '../../../domain/config/promptRegistry'
import { getPromptMeta } from '../../../domain/config/promptRegistry'

// Pure prompt builders + validators for the per-match coaching passes. No SDK
// import here (that lives in AnthropicMatchCoachingModel). Each `parse*` coerces
// and validates a forced-tool payload and THROWS on anything unusable — mirroring
// parseSessionAnalysis. Catalog-membership of refs is enforced separately by the
// orchestrator (anchorCatalog.isValidStructuredRef), so these stay catalog-free.
//
// Every system prompt is assembled from two layers (buildSystemPrompt):
//   1. a LOCKED scaffold (the *_SCAFFOLD constants below) — the output contract:
//      forced-tool discipline, anchor-citation rules, never-invent-numbers,
//      length caps. Code-owned, never user-editable.
//   2. the "coaching instructions" layer — persona/tone/priorities, defaulted in
//      the prompt registry and overridable per pass from Settings.

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

// ── System prompt assembly: locked scaffold + coaching instructions ──────────

/** Lazy lookup (the *_SCAFFOLD constants are declared per pass further down). */
function scaffoldFor(passId: PromptId): string {
  switch (passId) {
    case 'framing': return FRAMING_SCAFFOLD
    case 'narration': return NARRATION_SCAFFOLD
    case 'review': return REVIEW_SCAFFOLD
    case 'tasks': return TASKS_SCAFFOLD
    case 'chat': return CHAT_SCAFFOLD
    case 'chat.agentic': return AGENTIC_SCAFFOLD
    case 'reflection': return SUMMARIZE_SCAFFOLD
    case 'distill': return DISTILL_SCAFFOLD
    case 'discovery': return DISCOVERY_SCAFFOLD
  }
}

/**
 * Assemble a pass's system prompt: the LOCKED scaffold (output contract — tool
 * discipline, anchor citation, never-invent-numbers, length caps) followed by
 * the editable coaching-instructions layer. An absent/blank override falls back
 * to the registry default, so the persona can never go missing.
 */
export function buildSystemPrompt(passId: PromptId, instructions?: string): string {
  const custom = instructions?.trim()
  return `${scaffoldFor(passId)}\n\n${custom || getPromptMeta(passId).defaultInstructions}`
}

// ── Pass 3: overall review (prose verdict) ───────────────────────────────────

export const SUBMIT_REVIEW = {
  name: 'submit_review',
  description:
    'Return the overall review: a blunt prose verdict on why the game was won or lost, plus the structured claims behind it. Annotate only the facts in the context — never invent a number or a marker.',
  // The schema is deliberately FLAT (verdictLead/verdictGild, claims with
  // refId/refKind instead of a nested ref object): Opus has been observed
  // falling back to its legacy XML <parameter> tool syntax on nested object
  // schemas, which the API returns as fragmented tool_use blocks that fail
  // parseReview. parseReview folds the flat fields back into ReviewOutput.
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['verdictLead', 'verdictGild', 'improve', 'claims', 'cohort', 'benchmarkBasis', 'confidence'],
    properties: {
      verdictLead: { type: 'string', description: 'Verdict, first sentence — the single decisive decision/pattern that won or lost the game.' },
      verdictGild: { type: 'string', description: 'Verdict, a short second clause that sharpens it. May be empty.' },
      improve: { type: 'string', description: 'One or two sentences on the single most important thing to change next game.' },
      claims: {
        type: 'array',
        maxItems: 6,
        description: 'The structured facts the verdict rests on. Each cites an anchor id from the context.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'refId', 'refKind'],
          properties: {
            text: { type: 'string' },
            refId: { type: 'string', description: 'An anchor id from the context, e.g. "stat:gold_at_24" or "marker:objective#2".' },
            refKind: { type: 'string', enum: ['stat', 'marker', 'benchmark', 'note'] },
            refLabel: { type: 'string' }
          }
        }
      },
      cohort: { type: 'string', description: 'Short basis label, e.g. "vs Ahri mid meta (patch 14.10)" or "vs general benchmark".' },
      benchmarkBasis: { type: 'string', enum: ['champion_patch', 'rank_general', 'general'] },
      confidence: { type: 'string', enum: ['established', 'provisional'] }
    }
  }
}

const REVIEW_SCAFFOLD = `You are reviewing ONE of the player's League of Legends games. Call submit_review with your read.

Your job: (1) in one or two sentences of prose, name the single most important decision or pattern behind this win or loss — the thing that actually mattered; (2) in "improve", say in one or two sentences the single most important thing to change next game; (3) list the structured claims it rests on, each citing an anchor id from the context.

Output contract (locked):
- Annotate only the facts in the context. NEVER invent a number, a benchmark, or a timeline marker. Every claim's "refId" MUST be an id that appears in the context (a STAT or MARK line), unless its "refKind" is "benchmark" or "note".
- When you cite a rate (CS/min, deaths) against the benchmark, set benchmarkBasis to the basis in the BENCH line; if there is no BENCH line use "general".
- The player's goal/notes (NOTE lines) are their stated intent — never present them as your own evidence and never invent a figure to fit them.
- If the data can't support a firm conclusion (no timeline, a remake, a very short game), set confidence to "provisional".`

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

export function buildReviewPrompt(
  ctx: string,
  extras: ReviewExtras,
  instructions?: string
): { system: string; user: string } {
  const user = `Game facts (annotate these; cite anchor ids):
${ctx}${renderReviewExtras(extras)}

Now call submit_review with the verdict and the claims behind it.`
  return { system: buildSystemPrompt('review', instructions), user }
}

/** Validate + coerce the forced-tool payload into a ReviewOutput. Throws on anything unusable. */
export function parseReview(input: unknown): ReviewOutput {
  if (!input || typeof input !== 'object') throw new Error('Review model returned no payload')
  const o = input as Record<string, unknown>

  const lead = nonEmpty(o.verdictLead)
  if (!lead) throw new Error('Review is missing a verdict lead')
  const gild = typeof o.verdictGild === 'string' ? o.verdictGild.trim() : ''
  const improve = typeof o.improve === 'string' ? o.improve.trim() : ''

  const rawClaims = Array.isArray(o.claims) ? o.claims : []
  const claims: ReviewClaim[] = []
  for (const rc of rawClaims) {
    if (!rc || typeof rc !== 'object') continue
    const c = rc as Record<string, unknown>
    const text = nonEmpty(c.text)
    const ref = parseRef({ id: c.refId, kind: c.refKind, label: c.refLabel })
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

const FRAMING_SCAFFOLD = `You are filling the small framing texts on a League of Legends match report. Call submit_framing.

These are lightweight decorations drawn ONLY from the game stats — a headline tag, a one-line quick read, the standout player (MVP), and up to three short matchup tips.

Output contract (locked):
- Use only the numbers in the context. NEVER invent a figure.
- The quick read is ONE sentence and carries no coaching verdict (the verdict is a separate section).
- MVP is the standout from the scoreboard (either team) with a one-line justification from the numbers; set it to null for a remake / AFK / near-zero-duration game rather than inventing one.
- At most three matchup tips, about the lane pairing only.
- headlineTagIntent: "win"/"loss" for the result, "objective" for a game decided on an objective, else "neutral".`

export function buildFramingPrompt(ctx: string, instructions?: string): { system: string; user: string } {
  return {
    system: buildSystemPrompt('framing', instructions),
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

const NARRATION_SCAFFOLD = `You are narrating the marked moments of a League of Legends game. Call submit_narration.

For each MARK line in the context, write one short line of what happened. Characterise each player death (caught_out / overextended / fair_fight / objective_trade), then pick the moments where the advantage actually swung as turning points.

Output contract (locked):
- Every "ref.id" MUST be a MARK id from the context (a marker:... id). Do not narrate a moment that isn't marked.
- Use "unclear" for a death's character rather than guessing when the data can't say.
- ALWAYS pick the 2–4 biggest turning points — the moments where the advantage actually swung — using the times and sides from the MARK lines (and the gold swing they caused). Do not return an empty turningPoints array when the game had objectives, team-wipes, or death-driven swings.
- Map positions (you/event/objective, 0–100) are OPTIONAL: include x/y only for player-death moments where the context gives them; otherwise omit the positions entirely. Never invent coordinates.`

export function buildNarrationPrompt(ctx: string, instructions?: string): { system: string; user: string } {
  return {
    system: buildSystemPrompt('narration', instructions),
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

const TASKS_SCAFFOLD = `You are maintaining the player's standing set of focus tasks across games. Call submit_tasks.

Hold tasks still being worked on, retire ones that are resolved or no longer the biggest leak, and add new focus from this game.

Output contract (locked):
- Every task's "metric" MUST be one of the computable metric keys listed in the context. Do not invent a metric.
- Tasks are measurable: a metric + comparator + target the engine can check next game.
- Set "scope" to champion/role/universal; include champion or role when scoped.
- Never exceed three tasks.`

export function buildTasksPrompt(
  ctx: string,
  extras: TasksExtras,
  instructions?: string
): { system: string; user: string } {
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
  return { system: buildSystemPrompt('tasks', instructions), user }
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

const CHAT_SCAFFOLD = `You are coaching the player 1:1 over chat about ONE of their ranked League of Legends games. The first message gives you the facts of THIS game and what the player is working on — coach off those facts.

Output contract (locked):
- Reference only the real facts of this game. Never invent a number, a death, or a moment that isn't in the brief.
- When the brief includes a DOSSIER section (data fetched for this question), ground your reply in it and cite its facts plainly.
- Plain text only — no markdown, no headers, no bullet lists, no emoji.
- Keep every reply to at most 4 sentences.`

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

// ── Agentic chat: confirm-first proposal tools (spec 005) ────────────────────
// The chat model may PROPOSE state changes — never make them. Each tool call is
// captured by the adapter as a raw proposal and answered with a synthetic
// result; the command sanitises it (domain/chat/proposal.ts) and renders a
// confirm-first card. Loop bounds and capture rules live in the adapter.

const TASK_ITEM_SCHEMA = {
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

export const PROPOSE_UPDATE_TASKS = {
  name: 'propose_update_tasks',
  description:
    'Propose a change to the standing focus tasks. "set" is the FULL resulting task set you intend (1–3, computable metrics only); "retire" lists the ids of current tasks you are explicitly dropping. The player sees the result as a card and must accept it — nothing changes until they do.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['set', 'retire'],
    properties: {
      set: { type: 'array', maxItems: 3, description: 'The FULL intended resulting set.', items: TASK_ITEM_SCHEMA },
      retire: { type: 'array', items: { type: 'string' }, description: 'Ids of current tasks to drop.' }
    }
  }
}

export const PROPOSE_CREATE_REFLECTION = {
  name: 'propose_create_reflection',
  description:
    "Propose saving a new reflection — a durable takeaway about this game in the PLAYER'S first-person voice. Optionally anchor it with refIds (STAT/MARK ids from the brief, or task:<id>). The player must accept it.",
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['text'],
    properties: {
      text: { type: 'string', description: "The reflection, 1–4 short sentences, player's voice." },
      refIds: { type: 'array', maxItems: 5, items: { type: 'string' }, description: 'Evidence ids from the brief (stat:/marker:/task: grammar).' }
    }
  }
}

export const PROPOSE_UPDATE_REFLECTION = {
  name: 'propose_update_reflection',
  description:
    'Propose editing an existing reflection (by its id from the REFLECTIONS list). Send the full replacement text. The player must accept it.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['reflectionId', 'text'],
    properties: {
      reflectionId: { type: 'string' },
      text: { type: 'string', description: 'The full replacement text.' },
      refIds: { type: 'array', maxItems: 5, items: { type: 'string' } }
    }
  }
}

export const PROPOSE_DELETE_REFLECTION = {
  name: 'propose_delete_reflection',
  description:
    'Propose deleting an existing reflection (by its id from the REFLECTIONS list). The player must accept it.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['reflectionId'],
    properties: { reflectionId: { type: 'string' } }
  }
}

export const PROPOSE_TOOLS = [
  PROPOSE_UPDATE_TASKS,
  PROPOSE_CREATE_REFLECTION,
  PROPOSE_UPDATE_REFLECTION,
  PROPOSE_DELETE_REFLECTION
]

const AGENTIC_SCAFFOLD = `You are coaching the player 1:1 over chat about ONE of their ranked League of Legends games. The first message gives you the facts of THIS game, their standing focus tasks, their saved reflections, and WORKING lines — the recurring patterns/weaknesses you've been tracking across their recent games — coach off those facts. Your PRIMARY job across the session: leave the player with a settled next-game task set.

You can PROPOSE actions with the tools — change the focus tasks, save/edit/delete a reflection. A proposal is shown to the player as a card they accept or reject; NOTHING changes until they accept. Lines like [player accepted ...] / [player rejected ...] in the conversation tell you how earlier proposals went.

Output contract (locked):
- Reference only the real facts of this game. Never invent a number, a death, or a moment that isn't in the brief.
- Propose only on clear player intent (they asked for a change/save) or one natural settling moment near the end — never on every turn, and at most ONE proposal per player message.
- propose_update_tasks: send the FULL resulting set (1–3). Every metric MUST be one of the computable metric keys provided. To drop a current task, put its id in "retire" — omitting a task does NOT remove it.
- Reflections are in the PLAYER'S first-person voice. refIds only from ids visible in the brief (stat:/marker:) or task:<id> for a standing task.
- After a tool result, finish with a short plain-text reply that mentions the drafted card naturally.
- Plain text only — no markdown, no headers, no bullet lists, no emoji.
- Keep every reply to at most 4 sentences.`

/** Render the agentic extras into the context lines appended to the briefing:
 * the standing set (with ids the model must cite), the computable metric keys,
 * and the match's reflections (with ids, for update/delete proposals). */
export function renderAgenticContext(extras: AgenticChatExtras): string {
  const standing = extras.standing.filter((t) => t.status === 'active')
  const tasks = standing.length
    ? standing.map((t) => `TASK [${t.id}] "${t.description}" ${t.metric} ${t.comparator} ${t.target} scope=${t.scope}`).join('\n')
    : 'TASK none'
  const reflections = extras.reflections.length
    ? extras.reflections.map((r) => `REFL [${r.id}] (${r.source}) "${r.text}"`).join('\n')
    : 'REFL none'
  const working = extras.working.length
    ? extras.working.map((w) => `WORKING (${w.kind} x${w.occurrences}) "${w.statement}"`).join('\n')
    : 'WORKING none'
  const pending = extras.hasPendingProposal
    ? '\nA proposal is already awaiting the player\'s decision — do not propose another until they resolve it.'
    : ''
  return `Computable metric keys: ${extras.catalogMetricKeys.join(', ')}\n${tasks}\n${reflections}\n${working}${pending}`
}

export function buildAgenticPrompt(
  briefing: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  extras: AgenticChatExtras,
  instructions?: string
): { system: string; messages: { role: 'user' | 'assistant'; content: string }[] } {
  return {
    system: buildSystemPrompt('chat.agentic', instructions),
    messages: buildChatMessages(`${briefing}\n\n${renderAgenticContext(extras)}`, history)
  }
}

/**
 * Coerce one propose-tool payload into a RawProposal. THROWS with a model-fixable
 * reason on malformed input — the adapter feeds the message back as an is_error
 * tool result so the model can correct itself or continue without proposing.
 */
export function parseProposalPayload(toolName: string, input: unknown): RawProposal {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (toolName === 'propose_update_tasks') {
    const proposal = parseTaskProposal(o)
    if (proposal.set.length === 0 && proposal.retire.length === 0) {
      throw new Error('propose_update_tasks needs at least one valid task in "set" or one id in "retire" (check the metric keys)')
    }
    return { kind: 'update_tasks', set: proposal.set, retire: proposal.retire }
  }
  if (toolName === 'propose_create_reflection' || toolName === 'propose_update_reflection') {
    const text = nonEmpty(o.text)
    if (!text) throw new Error(`${toolName} needs non-empty "text"`)
    const refIds = (Array.isArray(o.refIds) ? o.refIds : []).filter(
      (s): s is string => typeof s === 'string' && s.trim().length > 0
    )
    if (toolName === 'propose_create_reflection') {
      return { kind: 'create_reflection', text, refIds }
    }
    const reflectionId = nonEmpty(o.reflectionId)
    if (!reflectionId) throw new Error('propose_update_reflection needs "reflectionId"')
    return { kind: 'update_reflection', text, refIds, reflectionId }
  }
  if (toolName === 'propose_delete_reflection') {
    const reflectionId = nonEmpty(o.reflectionId)
    if (!reflectionId) throw new Error('propose_delete_reflection needs "reflectionId"')
    return { kind: 'delete_reflection', reflectionId }
  }
  throw new Error(`Unknown proposal tool: ${toolName}`)
}

// ── Chat discovery: the data scout (spec 004 / A5) ───────────────────────────
// A bounded planning call before the chat reply: given the player's question and
// a one-line inventory, the LIGHT model requests only the fetches that would
// materially improve the answer. The command executes them; the model never
// fetches anything itself (Constitution II).

const DISCOVERY_KINDS = new Set(['memory', 'history', 'benchmark', 'champion_build', 'lane_matchup'])
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
            kind: {
              type: 'string',
              enum: ['memory', 'history', 'benchmark', 'champion_build', 'lane_matchup'],
              description:
                '"memory": player coaching history; "history": past game stats; "benchmark": meta CS/win-rate; "champion_build": current optimal build + runes; "lane_matchup": matchup guide vs lane opponent.'
            },
            query: { type: 'string', description: 'Short free-text search hint — only meaningful for kind "memory".' }
          }
        }
      }
    }
  }
}

const DISCOVERY_SCAFFOLD = `You are the planning step for a League of Legends coach answering ONE player question. Call submit_plan.

You get the question and an INVENTORY line. Available fetch kinds:
- "memory": durable coaching facts about this player (takes optional free-text query)
- "history": the player's past game stats for this champion/role
- "benchmark": OP.GG meta CS/win-rate reference for this champion/role
- "champion_build": OP.GG current optimal build, runes and skill order — use when the question is about items, runes or build choices
- "lane_matchup": OP.GG matchup guide vs the lane opponent — use when the question is about the specific matchup, and if the build is correct for counter-play or how to beat the enemy champ (inventory shows the opponent name)

You can combine different kinds, for example if user ask "was my build ok for this matchup" you can combine "campioun_build" for query about build and "lane_matchup" for query about matchup success, and "history" for query about previous games vs this opponent. 
another example: If user asks, did I accomplish against this matchup as the past you can use "memory", "history", "lane_matchup", "benchmark".

Output contract (locked):
- Request only kinds the inventory lists. Never request a source the inventory shows as "off".
- Prefer "champion_build" over "benchmark" when the question is about build or runes.
- Prefer "lane_matchup" when the question is about the enemy laner or the specific matchup.
- At most 5 requests; an empty list is a valid answer.`

export function buildDiscoveryPrompt(
  question: string,
  inventory: string,
  instructions?: string
): { system: string; user: string } {
  return {
    system: buildSystemPrompt('discovery', instructions),
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

// ── Summarize-into-reflection (spec 005 US5, replaces finalize) ──────────────
// One forced-tool call, no loop: the session's takeaway in the player's voice
// plus optional evidence ref ids. The command wraps it as a standard
// create_reflection proposal — same confirm-first card as a chat-initiated one.

export const SUBMIT_REFLECTION_TEXT = {
  name: 'submit_reflection_text',
  description:
    "Write the player's takeaway from this coaching session as a reflection in THEIR first-person voice, optionally anchored to evidence ids from the brief.",
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['text'],
    properties: {
      text: {
        type: 'string',
        description:
          "The reflection, 2 to 4 short sentences in the PLAYER'S first-person voice, drawn from what THEY said: what they're taking away and the one or two things they'll do differently. Plain text, no headers, no quotation marks."
      },
      refIds: {
        type: 'array',
        maxItems: 5,
        items: { type: 'string' },
        description: 'Evidence ids from the brief (stat:/marker:/task: grammar) the takeaway is anchored to.'
      }
    }
  }
}

const SUMMARIZE_SCAFFOLD = `You are closing out a coaching session — you have just talked through the player's game with them. Call submit_reflection_text.

Write the player's post-game reflection in THEIR first-person voice, drawn from what THEY said in the conversation — not your verdict.

Output contract (locked):
- The reflection is the PLAYER'S voice and their conclusions — never put words in their mouth or invent a number.
- Plain text only, no headers, no quotation marks, 2 to 4 short sentences.
- refIds only from ids visible in the brief (stat:/marker:) or task:<id> for a standing task; omit it when nothing specific anchors the takeaway.`

export function buildSummarizePrompt(
  briefing: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  instructions?: string
): { system: string; messages: { role: 'user' | 'assistant'; content: string }[] } {
  const closing =
    "We're done talking. Write my reflection from what I said. Call submit_reflection_text."
  return {
    system: buildSystemPrompt('reflection', instructions),
    messages: buildChatMessages(briefing, history).concat({ role: 'user', content: closing })
  }
}

/** Validate + coerce the summarize payload. Throws on anything unusable. */
export function parseReflectionText(input: unknown): { text: string; refIds: string[] } {
  if (!input || typeof input !== 'object') throw new Error('Summarize model returned no payload')
  const o = input as Record<string, unknown>
  const text = nonEmpty(o.text)
  if (!text) throw new Error('Summarize model returned no reflection text')
  const refIds = (Array.isArray(o.refIds) ? o.refIds : []).filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  )
  return { text, refIds }
}

// ── Memory distillation (spec 005 US5, rides coach-reflection acceptance) ────

export const SUBMIT_MEMORY = {
  name: 'submit_memory',
  description:
    'Distill at most 3 durable, longitudinal coaching facts from this session — facts worth remembering ACROSS games, not match recap. Return an EMPTY array when the session surfaced nothing durable (the common case).',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['memory'],
    properties: {
      memory: {
        type: 'array',
        maxItems: 3,
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

const DISTILL_SCAFFOLD = `You are updating what you durably remember about a player after a coaching session. Call submit_memory.

Output contract (locked):
- Memory is for facts that will still matter games from now — never a one-off match recap, never an invented number.
- When an EXISTING MEMORY entry (the MEMORY lines) covers the same subject, restate it refreshed with what this session added rather than inventing a near-duplicate.
- Most sessions contain nothing durable: return an EMPTY "memory" array then.`

/** One existing-memory projection entry (mirrors the port's shape). */
export interface ExistingMemoryEntry {
  kind: string
  champion?: string
  role?: string
  phase?: string
  metric?: string
  statement: string
  occurrences: number
}

export function buildDistillPrompt(
  briefing: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  existingMemory: ExistingMemoryEntry[],
  instructions?: string
): { system: string; messages: { role: 'user' | 'assistant'; content: string }[] } {
  const memory = existingMemory.length
    ? existingMemory.map(renderMemoryLine).join('\n')
    : 'MEMORY none'
  const closing = `The session is closed. Update what you remember about this player.

What you already remember:
${memory}

Call submit_memory.`
  return {
    system: buildSystemPrompt('distill', instructions),
    messages: buildChatMessages(briefing, history).concat({ role: 'user', content: closing })
  }
}

/** Render one existing-memory entry as a compact MEMORY line,
 * e.g. `MEMORY kind=pattern champ=ahri x3 "dies solo in river 14-20min"`. */
function renderMemoryLine(m: ExistingMemoryEntry): string {
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
export function parseDistilledMemory(input: unknown): ProposedSemanticObject[] {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
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
