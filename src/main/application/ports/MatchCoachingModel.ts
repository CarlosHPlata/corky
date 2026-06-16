import type {
  FramingOutput, NarrationOutput, ReviewOutput, ReflectionSource,
  StandingFocusTask, FocusTaskEval, BenchmarkBasis, MetricKey, ChatTurn
} from '@shared/types'
import type { GeneratedTask } from '../../domain/report/focusTask'
import type { ProposedSemanticObject } from '../../domain/memory/semanticObject'
import type { RawProposal } from '../../domain/chat/proposal'

/** Benchmark reference passed to the review pass (tagged with its basis). */
export interface BenchmarkRef {
  metric: string
  basis: BenchmarkBasis
  ref: number
  patch?: string
}

/** Extra context for the overall-review pass (pass 3). `external` is the
 * pluggable input for later cross-game context (FR-026b) — unused this iteration. */
export interface ReviewExtras {
  /** Compact one-liner carried from pass 1 (framing). */
  framing: string
  /** Compact one-liner carried from pass 2 (narration). */
  narration: string
  benchmark: BenchmarkRef | null
  goal?: string
  reflection?: string
  external?: unknown
}

/** Extra context for the focus-tasks pass (pass 4). */
export interface TasksExtras {
  standing: StandingFocusTask[]
  sinceLast: FocusTaskEval[]
  goal?: string
  /** The metric keys the extraction engine can compute (generated tasks must use one). */
  catalogMetricKeys: MetricKey[]
}

/** The model's contribution to pass 4: new/updated tasks + ids to retire. The
 * deterministic since-last evaluation and firstTime flag are assembled by the
 * orchestrator, not the model. */
export interface TaskProposal {
  set: GeneratedTask[]
  retire: string[]
}

/** Compact projection of the player's current semantic memory, carried into
 * the distillation call so the model refreshes a known subject instead of
 * duplicating it (spec 005). */
export interface ExistingMemoryEntry {
  kind: string
  champion?: string
  role?: string
  phase?: string
  metric?: string
  statement: string
  occurrences: number
}

/** Extra context for the agentic chat call (spec 005): what the model may
 * propose against. Compact projections only — never full rows. */
export interface AgenticChatExtras {
  standing: StandingFocusTask[]
  /** What the coach has been tracking across games (active patterns/weaknesses),
   * occurrences-descending. Always-on context — distinct from the on-demand
   * DOSSIER memory the discovery flow may fetch for a specific question. */
  working: { statement: string; kind: string; occurrences: number }[]
  /** The metric keys the extraction engine can compute (proposed tasks must use one). */
  catalogMetricKeys: MetricKey[]
  /** This match's reflections, projected for reference by id in proposals. */
  reflections: { id: string; source: ReflectionSource; text: string }[]
  /** True when a pending proposal already awaits the player — blocks new ones. */
  hasPendingProposal: boolean
}

/** The agentic chat's bounded outcome: the reply text plus at most ONE raw
 * (unsanitised) proposal captured from the tool loop. */
export interface AgenticChatResult {
  reply: string
  rawProposal?: RawProposal
}

/** One data fetch the discovery planner asks for before a chat reply. `query`
 * is a free-text FTS hint, only meaningful for kind 'memory' — other kinds are
 * parameterless (the command knows the match context). */
export interface DiscoveryRequest {
  kind: 'memory' | 'history' | 'benchmark' | 'champion_build' | 'lane_matchup'
  query?: string
}

/** The planner's bounded answer: which fetches to make before replying (≤5).
 * An empty list is the common case — the briefing already covers most questions. */
export interface DiscoveryPlan {
  requests: DiscoveryRequest[]
}

/**
 * Driven port for the per-match coach. One method per pass; each takes the
 * compact context string (never raw JSON) + typed extras and returns a validated
 * pass DTO. The model only annotates the facts in the context — it never invents
 * numbers and never fetches data (Constitution II).
 */
export interface MatchCoachingModel {
  analyzeFraming(ctx: string, model: string): Promise<FramingOutput>
  analyzeNarration(ctx: string, model: string): Promise<NarrationOutput>
  analyzeReview(ctx: string, extras: ReviewExtras, model: string): Promise<ReviewOutput>
  analyzeTasks(ctx: string, extras: TasksExtras, model: string): Promise<TaskProposal>
  /**
   * Free-form coaching chat. `briefing` is the factual brief for this game (built
   * by the orchestrator); `history` is the conversation so far. Returns Corky's
   * next reply as plain text. The model talks ABOUT the briefing's facts — it
   * never invents numbers (Constitution II).
   */
  chat(briefing: string, history: ChatTurn[], model: string): Promise<string>
  /**
   * Agentic coaching chat (spec 005): same briefing+history as `chat`, plus
   * propose-only tools. The adapter runs a BOUNDED tool loop (≤3 rounds) and
   * captures at most one raw proposal — it never executes anything. Returns
   * the reply text and the captured proposal, if any; sanitisation and the
   * confirm-first card are the command's job.
   */
  chatAgentic(
    briefing: string,
    history: ChatTurn[],
    extras: AgenticChatExtras,
    model: string
  ): Promise<AgenticChatResult>
  /**
   * Plan the discovery step before a chat reply: given the player's question and
   * a one-line inventory of the data available, decide which fetches would
   * materially improve the answer (the data scout). Runs on the light tier; an
   * empty plan is a good answer.
   */
  planDiscovery(question: string, inventory: string, model: string): Promise<DiscoveryPlan>
  /**
   * Summarize a session into a reflection (spec 005): one forced-tool call
   * returning the takeaway text (player's voice) + optional evidence ref ids.
   * The orchestrator wraps it as a standard create_reflection proposal.
   */
  summarizeReflectionText(
    briefing: string,
    history: ChatTurn[],
    model: string
  ): Promise<{ text: string; refIds: string[] }>
  /**
   * Distill 0–3 durable coaching facts from a closed session (spec 005). Runs
   * best-effort after a coach reflection is accepted; an empty result is the
   * common case. The caller merges additively into semantic memory.
   */
  distillMemory(
    briefing: string,
    history: ChatTurn[],
    existingMemory: ExistingMemoryEntry[],
    model: string
  ): Promise<ProposedSemanticObject[]>
}
