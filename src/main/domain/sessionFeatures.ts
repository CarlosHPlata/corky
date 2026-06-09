import type { MatchSummary, SummonerProfile, LpSnapshot, BenchmarkBasis } from '@shared/types'
import type { BenchmarkReference, ChampionMetaStanding } from './benchmark'

/** Compact per-game row handed to the model. List is ordered most-recent-first. */
export interface GameLine {
  champion: string
  role: string
  win: boolean
  kills: number
  deaths: number
  assists: number
  csPerMin: number
  durationMin: number
}

export interface PoolEntry {
  champion: string
  role: string
  games: number
  wins: number
  winRate: number
  avgKda: number
  avgCsPerMin: number
  metaStanding?: ChampionMetaStanding
}

export interface SessionFeatures {
  rank: { tier: string; division: string; leaguePoints: number } | null
  gameCount: number
  deathsPerGame: number
  deathsPerGameInWins: number
  deathsPerGameInLosses: number
  avgCsPerMin: number
  csBenchmark: number
  /** avgCsPerMin - csBenchmark (signed; negative = trailing the reference). */
  csGapVsBenchmark: number
  deathsBenchmark: number
  avgKda: number
  winRate: number
  /** Healthy KDA but poor win rate — the "wins lane, loses game" signal. */
  leadConversionConcern: boolean
  pool: PoolEntry[]
  poolShape: { championCount: number; topChampShare: number; winRateSpread: number }
  /** netSession is null when the player crossed a tier/division (raw LP misleads). */
  lp: { netSession: number | null; choppy: boolean }
  games: GameLine[]
  benchmarkBasis: BenchmarkBasis
}

/** The most-played champion+role in the set (ties broken by order). Null if empty. */
export function topChampionRole(matches: MatchSummary[]): { champion: string; role: string } | null {
  const counts = new Map<string, { champion: string; role: string; games: number }>()
  for (const m of matches) {
    const e = counts.get(m.champion) || { champion: m.champion, role: m.role, games: 0 }
    e.games++
    counts.set(m.champion, e)
  }
  let top: { champion: string; role: string; games: number } | null = null
  for (const e of counts.values()) {
    if (!top || e.games > top.games) top = e
  }
  return top ? { champion: top.champion, role: top.role } : null
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** KDA from totals, guarding a zero-death denominator. */
function kda(kills: number, assists: number, deaths: number): number {
  return round2((kills + assists) / Math.max(1, deaths))
}

function lpStats(lp: LpSnapshot[]): { netSession: number | null; choppy: boolean } {
  if (lp.length < 2) return { netSession: null, choppy: false }
  const first = lp[0]
  const last = lp[lp.length - 1]
  const sameBucket = first.tier === last.tier && first.division === last.division
  const net = sameBucket ? last.leaguePoints - first.leaguePoints : null
  let absMovement = 0
  for (let i = 1; i < lp.length; i++) {
    absMovement += Math.abs(lp[i].leaguePoints - lp[i - 1].leaguePoints)
  }
  // Choppy = lots of back-and-forth relative to the net gain (gained-then-gave-back).
  const choppy = net != null && absMovement > 0 && absMovement >= 2 * Math.abs(net)
  return { netSession: net, choppy }
}

function buildPool(matches: MatchSummary[]): PoolEntry[] {
  const by: Record<string, { champion: string; role: string; games: number; wins: number; k: number; d: number; a: number; cs: number }> = {}
  for (const m of matches) {
    const e = by[m.champion] || (by[m.champion] = { champion: m.champion, role: m.role, games: 0, wins: 0, k: 0, d: 0, a: 0, cs: 0 })
    e.games++
    if (m.win) e.wins++
    e.k += m.kills
    e.d += m.deaths
    e.a += m.assists
    e.cs += m.csPerMin
  }
  return Object.values(by)
    .map((e) => ({
      champion: e.champion,
      role: e.role,
      games: e.games,
      wins: e.wins,
      winRate: round2(e.wins / e.games),
      avgKda: kda(e.k, e.a, e.d),
      avgCsPerMin: round1(e.cs / e.games)
    }))
    .sort((x, y) => y.games - x.games || y.winRate - x.winRate)
}

/**
 * Project the player's recent games, pool, rank and a resolved benchmark onto the
 * hybrid "facts" the coaching model reasons over. Pure — no I/O, deterministic.
 * Tolerant of empty/short inputs (callers use `gameCount` to decide `noData`).
 */
export function computeSessionFeatures(input: {
  matches: MatchSummary[]
  profile: SummonerProfile | null
  lpHistory: LpSnapshot[]
  benchmark: BenchmarkReference
}): SessionFeatures {
  const { matches, profile, lpHistory, benchmark } = input
  const gameCount = matches.length

  const wins = matches.filter((m) => m.win)
  const losses = matches.filter((m) => !m.win)
  const sum = (arr: MatchSummary[], pick: (m: MatchSummary) => number): number =>
    arr.reduce((acc, m) => acc + pick(m), 0)
  const avg = (arr: MatchSummary[], pick: (m: MatchSummary) => number): number =>
    arr.length ? sum(arr, pick) / arr.length : 0

  const deathsPerGame = round1(avg(matches, (m) => m.deaths))
  const deathsPerGameInWins = round1(avg(wins, (m) => m.deaths))
  const deathsPerGameInLosses = round1(avg(losses, (m) => m.deaths))
  const avgCsPerMin = round1(avg(matches, (m) => m.csPerMin))
  const avgKda = kda(sum(matches, (m) => m.kills), sum(matches, (m) => m.assists), sum(matches, (m) => m.deaths))
  const winRate = gameCount ? round2(wins.length / gameCount) : 0

  const pool = buildPool(matches)
  // Attach champion meta standing to the matching pool entry when the benchmark carries it.
  const standing = benchmark.topChampStanding
  if (standing) {
    const entry = pool.find((p) => p.champion === standing.champion)
    if (entry) entry.metaStanding = standing
  }

  const withMinSample = pool.filter((p) => p.games >= 2)
  const spreadSet = withMinSample.length >= 2 ? withMinSample : pool
  const winRates = spreadSet.map((p) => p.winRate)
  const winRateSpread = winRates.length >= 2 ? round2(Math.max(...winRates) - Math.min(...winRates)) : 0
  const topChampShare = gameCount ? round2((pool[0]?.games ?? 0) / gameCount) : 0

  const games: GameLine[] = [...matches]
    .sort((a, b) => b.gameCreation - a.gameCreation)
    .map((m) => ({
      champion: m.champion,
      role: m.role,
      win: m.win,
      kills: m.kills,
      deaths: m.deaths,
      assists: m.assists,
      csPerMin: m.csPerMin,
      durationMin: round1(m.gameDuration / 60)
    }))

  const rank = profile?.soloRank
    ? { tier: profile.soloRank.tier, division: profile.soloRank.division, leaguePoints: profile.soloRank.leaguePoints }
    : null

  return {
    rank,
    gameCount,
    deathsPerGame,
    deathsPerGameInWins,
    deathsPerGameInLosses,
    avgCsPerMin,
    csBenchmark: benchmark.csPerMin,
    csGapVsBenchmark: round1(avgCsPerMin - benchmark.csPerMin),
    deathsBenchmark: benchmark.deathsCeiling,
    avgKda,
    winRate,
    leadConversionConcern: avgKda >= 2.5 && winRate < 0.5,
    pool,
    poolShape: { championCount: pool.length, topChampShare, winRateSpread },
    lp: lpStats(lpHistory),
    games,
    benchmarkBasis: benchmark.basis
  }
}
