import type {
  FramingOutput, NarrationOutput, ReviewOutput,
  StandingFocusTask, FocusTaskEval, BenchmarkBasis, MetricKey
} from '@shared/types'
import type { GeneratedTask } from '../../domain/report/focusTask'

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
}
