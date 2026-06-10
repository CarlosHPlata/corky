import type {
  FramingOutput, NarrationOutput, ReviewOutput,
  StandingFocusTask, FocusTaskEval, BenchmarkBasis, MetricKey, ChatTurn
} from '@shared/types'
import type { GeneratedTask } from '../../domain/report/focusTask'
import type { ProposedSemanticObject } from '../../domain/memory/semanticObject'

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

/** Extra context for finalising a coaching session into a reflection (spec 004).
 * Corky may adjust the standing focus tasks off the back of the conversation, so
 * it needs the current set + the computable metric keys (same rule as pass 4).
 * `existingMemory` is a compact projection of the player's current semantic
 * memory, so the model refreshes a known subject instead of duplicating it. */
export interface ReflectionExtras {
  standing: StandingFocusTask[]
  catalogMetricKeys: MetricKey[]
  goal?: string
  existingMemory: {
    kind: string
    champion?: string
    role?: string
    phase?: string
    metric?: string
    statement: string
    occurrences: number
  }[]
}

/** The model's output when finalising a session: the written reflection, an
 * optional adjustment to the standing focus tasks (same shape as a TaskProposal),
 * plus 0–3 durable coaching facts distilled from the session. An empty `memory`
 * is the common case — most sessions surface nothing worth remembering. */
export interface ReflectionProposal {
  reflection: string
  tasks: TaskProposal
  memory: ProposedSemanticObject[]
}

/** One data fetch the discovery planner asks for before a chat reply. `query`
 * is a free-text FTS hint, only meaningful for kind 'memory' — history and
 * benchmark requests are parameterless (the command knows the match context). */
export interface DiscoveryRequest {
  kind: 'memory' | 'history' | 'benchmark'
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
   * Plan the discovery step before a chat reply: given the player's question and
   * a one-line inventory of the data available, decide which fetches would
   * materially improve the answer (the data scout). Runs on the light tier; an
   * empty plan is a good answer.
   */
  planDiscovery(question: string, inventory: string, model: string): Promise<DiscoveryPlan>
  /**
   * Finalise a session: write the player's reflection from the conversation and,
   * if the talk warrants it, adjust the standing focus tasks (computable metrics
   * only). Returns both; the orchestrator persists the task change.
   */
  summarizeReflection(
    briefing: string,
    history: ChatTurn[],
    extras: ReflectionExtras,
    model: string
  ): Promise<ReflectionProposal>
}
