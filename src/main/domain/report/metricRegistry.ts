import type { MatchReport, MetricKey } from '@shared/types'

// Pure. Maps a focus-task metric key to a deterministic extractor over the
// factual report. Two uses: validate generated tasks (a task whose metric is not
// here is dropped — Constitution "tasks without a computable metric MUST NOT be
// generated") and evaluate standing tasks against a game (taskEvaluation).
// null ⇒ not reached / not applicable — never substitute 0.

const REGISTRY: Record<MetricKey, (r: MatchReport) => number | null> = {
  cs_at_10: (r) => r.breakdown.csAt10,
  cs_per_min: (r) => r.core.csPerMin,
  gold_at_14: (r) => r.breakdown.goldAt14,
  gold_at_24: (r) => r.breakdown.goldAt24,
  vision_score: (r) => r.breakdown.visionScore,
  solo_deaths: (r) => r.breakdown.soloDeaths,
  kill_participation: (r) => r.breakdown.killParticipation,
  deaths: (r) => r.core.deaths
}

/** Every metric key the extraction engine can compute. */
export const METRIC_KEYS = Object.keys(REGISTRY) as MetricKey[]

/** True when a generated task's metric can be computed (else drop the task). */
export function isComputable(key: string): key is MetricKey {
  return Object.prototype.hasOwnProperty.call(REGISTRY, key)
}

/** Compute a metric for one game, or null when not reached / not applicable. */
export function computeMetric(key: MetricKey, report: MatchReport): number | null {
  const fn = REGISTRY[key]
  return fn ? fn(report) : null
}
