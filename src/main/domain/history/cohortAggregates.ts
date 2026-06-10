import { METRIC_KEYS } from '../report/metricRegistry'

// Pure. The deterministic engine behind "in your Ahri wins you were on ~80 CS
// at 10; here you had 55" (requirements: "measured against your own games").
// Resolves a comparison cohort over locally stored matches by fallback —
// exact matchup → same champion → same role → all games — preferring the
// player's WINNING games once the cohort holds enough of them (technical
// brief: "Comparison cohorts resolve by fallback", ≥3 sample minimum). No LLM,
// no I/O; the application layer feeds it rows built from stored raw JSON.

/** One stored game flattened to the registry metrics (null ⇒ not reached). */
export interface MatchMetricRow {
  matchId: string
  win: boolean
  champion: string
  role: string
  /** Absent when the game had no single opposed lane (jungle/roam). */
  opponentChampion?: string
  gameCreation: number
  /** Keyed by the metric-registry keys (cs_at_10, cs_per_min, …). */
  metrics: Record<string, number | null>
}

/** Which fallback tier the cohort resolved to (tagged on every comparison). */
export type CohortBasis = 'matchup' | 'champion' | 'role' | 'overall'

/** Deterministic aggregates over the resolved cohort. */
export interface CohortAggregates {
  basis: CohortBasis
  /** true ⇒ averages are over the cohort's winning games only. */
  preferredWins: boolean
  /** Cohort size / wins / win rate — always over the whole cohort. */
  games: number
  wins: number
  /** 0–1 fraction, rounded to 2 decimals. */
  winRate: number
  /** Per-metric mean over non-null values (1 decimal); null when no values. */
  averages: Record<string, number | null>
}

/** What the analysed game looked like — the cohort is matched against this. */
export interface CohortTarget {
  champion: string
  role: string
  opponentChampion?: string
}

const DEFAULT_MIN_SAMPLE = 3

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Resolve the comparison cohort by fallback: exact matchup (champion +
 * opponent) → same champion → same role → all rows. The first tier holding at
 * least `minSample` rows wins; `overall` is the unconditional last resort.
 * The analysed match itself never belongs in its own cohort — callers should
 * filter it out, but `excludeMatchId` defends regardless.
 */
export function resolveCohort(
  rows: MatchMetricRow[],
  target: CohortTarget,
  minSample = DEFAULT_MIN_SAMPLE,
  excludeMatchId?: string
): { basis: CohortBasis; rows: MatchMetricRow[] } {
  const pool = excludeMatchId ? rows.filter((r) => r.matchId !== excludeMatchId) : rows

  const tiers: { basis: CohortBasis; rows: MatchMetricRow[] }[] = [
    {
      basis: 'matchup',
      rows: target.opponentChampion
        ? pool.filter(
            (r) => r.champion === target.champion && r.opponentChampion === target.opponentChampion
          )
        : []
    },
    { basis: 'champion', rows: pool.filter((r) => r.champion === target.champion) },
    { basis: 'role', rows: pool.filter((r) => r.role === target.role) },
    { basis: 'overall', rows: pool }
  ]

  for (const tier of tiers) {
    if (tier.rows.length >= minSample) return tier
  }
  return tiers[tiers.length - 1]
}

/**
 * Resolve the cohort, then aggregate — over the cohort's WINNING games when it
 * holds at least `minSample` wins (the personal "your Ahri wins" baseline),
 * else over every cohort game. Averages ignore nulls (never fabricate 0) and
 * resolve to null when a metric has no values at all.
 */
export function computeCohortAggregates(
  rows: MatchMetricRow[],
  target: CohortTarget,
  opts: { minSample?: number; excludeMatchId?: string } = {}
): CohortAggregates {
  const minSample = opts.minSample ?? DEFAULT_MIN_SAMPLE
  const cohort = resolveCohort(rows, target, minSample, opts.excludeMatchId)

  const winRows = cohort.rows.filter((r) => r.win)
  const preferredWins = winRows.length >= minSample
  const sample = preferredWins ? winRows : cohort.rows

  const averages: Record<string, number | null> = {}
  for (const key of METRIC_KEYS) {
    const values = sample
      .map((r) => r.metrics[key])
      .filter((v): v is number => v != null)
    averages[key] = values.length > 0
      ? round1(values.reduce((s, v) => s + v, 0) / values.length)
      : null
  }

  return {
    basis: cohort.basis,
    preferredWins,
    games: cohort.rows.length,
    wins: winRows.length,
    winRate: cohort.rows.length > 0 ? round2(winRows.length / cohort.rows.length) : 0,
    averages
  }
}

/**
 * One terse HIST line for the model context (the compactContext grammar —
 * token spend goes to content, not punctuation). Null metrics are skipped.
 * e.g. `HIST basis=champion champ=Ahri wins_only=true games=7 wr=71% cs_at_10=78.5 …`
 */
export function renderHistoryBlock(agg: CohortAggregates, target: CohortTarget): string {
  const parts = [`HIST basis=${agg.basis}`]
  if (agg.basis === 'matchup') parts.push(`champ=${target.champion} vs=${target.opponentChampion}`)
  if (agg.basis === 'champion') parts.push(`champ=${target.champion}`)
  if (agg.basis === 'role') parts.push(`role=${target.role}`)
  parts.push(
    `wins_only=${agg.preferredWins}`,
    `games=${agg.games}`,
    `wr=${Math.round(agg.winRate * 100)}%`
  )
  for (const key of METRIC_KEYS) {
    const v = agg.averages[key]
    if (v != null) parts.push(`${key}=${v}`)
  }
  return parts.join(' ')
}
