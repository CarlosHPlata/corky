import type { BenchmarkBasis } from '@shared/types'

/**
 * Public meta standing for a champion in a role on the current patch.
 * Populated by the OP.GG benchmark source (US2); absent on the general fallback.
 */
export interface ChampionMetaStanding {
  champion: string
  role: string
  winRate: number
  /** OP.GG tier label, e.g. "S", "A", "B". */
  tier: string
  patch: string
}

/**
 * The measuring stick a session analysis is compared against. `basis` records
 * how specific the reference is, so the UI can state it honestly.
 */
export interface BenchmarkReference {
  basis: BenchmarkBasis
  csPerMin: number
  deathsCeiling: number
  patch?: string
  topChampStanding?: ChampionMetaStanding
}

/**
 * Cold-start / OP.GG-unavailable fallback (research R3). Approximate per-tier
 * references for the two rate signals we diagnose. Always tagged `general` when
 * used, so the report discloses its basis.
 */
export const GENERAL_BENCHMARKS: Record<string, { csPerMin: number; deathsCeiling: number }> = {
  IRON: { csPerMin: 4.5, deathsCeiling: 6.5 },
  BRONZE: { csPerMin: 5.5, deathsCeiling: 6.0 },
  SILVER: { csPerMin: 6.0, deathsCeiling: 5.5 },
  GOLD: { csPerMin: 6.5, deathsCeiling: 5.0 },
  PLATINUM: { csPerMin: 7.0, deathsCeiling: 5.0 },
  EMERALD: { csPerMin: 7.2, deathsCeiling: 4.8 },
  DIAMOND: { csPerMin: 7.5, deathsCeiling: 4.5 },
  MASTER: { csPerMin: 8.0, deathsCeiling: 4.5 },
  GRANDMASTER: { csPerMin: 8.2, deathsCeiling: 4.5 },
  CHALLENGER: { csPerMin: 8.3, deathsCeiling: 4.5 }
}

/** Used when the tier is unknown/unranked. */
const DEFAULT_BENCHMARK = { csPerMin: 6.0, deathsCeiling: 5.5 }

/**
 * Resolve the general (rank-only) benchmark for a tier. Pure. Tier is the Riot
 * uppercase code (e.g. "PLATINUM"); unknown/null falls back to a neutral default.
 */
export function resolveGeneralBenchmark(tier: string | null): BenchmarkReference {
  const key = (tier ?? '').toUpperCase()
  const b = GENERAL_BENCHMARKS[key] ?? DEFAULT_BENCHMARK
  return { basis: 'general', csPerMin: b.csPerMin, deathsCeiling: b.deathsCeiling }
}
