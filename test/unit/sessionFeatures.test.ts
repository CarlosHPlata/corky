import { describe, it, expect } from 'vitest'
import { computeSessionFeatures } from '../../src/main/domain/sessionFeatures'
import { resolveGeneralBenchmark } from '../../src/main/domain/benchmark'
import type { MatchSummary, SummonerProfile, LpSnapshot } from '../../src/shared/types'

function match(o: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: o.matchId ?? 'EUW1_x',
    puuid: 'me',
    queue: 420,
    champion: o.champion ?? 'Ahri',
    role: o.role ?? 'Mid',
    win: o.win ?? true,
    kills: o.kills ?? 8,
    deaths: o.deaths ?? 4,
    assists: o.assists ?? 6,
    cs: o.cs ?? 200,
    csPerMin: o.csPerMin ?? 7,
    gold: o.gold ?? 12000,
    goldPerMin: o.goldPerMin ?? 400,
    gameCreation: o.gameCreation ?? 1_700_000_000_000,
    gameDuration: o.gameDuration ?? 1800
  }
}

const bench = resolveGeneralBenchmark('PLATINUM')

const profile: SummonerProfile = {
  puuid: 'me',
  gameName: 'Carlos',
  tagLine: 'EUW',
  platform: 'euw1',
  region: 'europe',
  profileIconId: 1,
  summonerLevel: 200,
  soloRank: { queueType: 'RANKED_SOLO_5x5', tier: 'PLATINUM', division: 'II', leaguePoints: 64, wins: 100, losses: 90 }
}

describe('computeSessionFeatures', () => {
  it('splits deaths between wins and losses', () => {
    const matches = [
      match({ win: true, deaths: 2 }),
      match({ win: true, deaths: 4 }),
      match({ win: false, deaths: 8 }),
      match({ win: false, deaths: 10 })
    ]
    const f = computeSessionFeatures({ matches, profile, lpHistory: [], benchmark: bench })
    expect(f.gameCount).toBe(4)
    expect(f.deathsPerGame).toBe(6)
    expect(f.deathsPerGameInWins).toBe(3)
    expect(f.deathsPerGameInLosses).toBe(9)
    expect(f.winRate).toBe(0.5)
  })

  it('computes the cs gap against the benchmark', () => {
    const matches = [match({ csPerMin: 6 }), match({ csPerMin: 6 }), match({ csPerMin: 6 })]
    const f = computeSessionFeatures({ matches, profile, lpHistory: [], benchmark: bench })
    expect(f.avgCsPerMin).toBe(6)
    expect(f.csBenchmark).toBe(bench.csPerMin)
    expect(f.csGapVsBenchmark).toBe(Math.round((6 - bench.csPerMin) * 10) / 10)
  })

  it('flags lead-conversion concern on healthy KDA but losing record', () => {
    const matches = [
      match({ win: false, kills: 8, assists: 8, deaths: 4 }),
      match({ win: false, kills: 6, assists: 10, deaths: 4 }),
      match({ win: true, kills: 5, assists: 5, deaths: 3 })
    ]
    const f = computeSessionFeatures({ matches, profile, lpHistory: [], benchmark: bench })
    expect(f.avgKda).toBeGreaterThanOrEqual(2.5)
    expect(f.winRate).toBeLessThan(0.5)
    expect(f.leadConversionConcern).toBe(true)
  })

  it('builds an ordered champion pool with per-champ rates', () => {
    const matches = [
      match({ champion: 'Ahri', win: true }),
      match({ champion: 'Ahri', win: false }),
      match({ champion: 'Syndra', win: true })
    ]
    const f = computeSessionFeatures({ matches, profile, lpHistory: [], benchmark: bench })
    expect(f.pool[0].champion).toBe('Ahri') // most games first
    expect(f.pool[0].games).toBe(2)
    expect(f.pool[0].winRate).toBe(0.5)
    expect(f.poolShape.championCount).toBe(2)
  })

  it('nulls the LP net when the player crossed a tier/division', () => {
    const lp: LpSnapshot[] = [
      { ts: 1, tier: 'GOLD', division: 'I', leaguePoints: 90 },
      { ts: 2, tier: 'PLATINUM', division: 'IV', leaguePoints: 10 }
    ]
    const f = computeSessionFeatures({ matches: [match(), match(), match()], profile, lpHistory: lp, benchmark: bench })
    expect(f.lp.netSession).toBeNull()
  })

  it('reports a net and choppiness within the same division', () => {
    const lp: LpSnapshot[] = [
      { ts: 1, tier: 'PLATINUM', division: 'II', leaguePoints: 50 },
      { ts: 2, tier: 'PLATINUM', division: 'II', leaguePoints: 80 },
      { ts: 3, tier: 'PLATINUM', division: 'II', leaguePoints: 40 },
      { ts: 4, tier: 'PLATINUM', division: 'II', leaguePoints: 60 }
    ]
    const f = computeSessionFeatures({ matches: [match(), match(), match()], profile, lpHistory: lp, benchmark: bench })
    expect(f.lp.netSession).toBe(10) // 60 - 50
    expect(f.lp.choppy).toBe(true) // 80 of movement for 10 net
  })

  it('orders the game list most-recent-first', () => {
    const matches = [
      match({ matchId: 'old', gameCreation: 100 }),
      match({ matchId: 'new', gameCreation: 300 }),
      match({ matchId: 'mid', gameCreation: 200 })
    ]
    const f = computeSessionFeatures({ matches, profile, lpHistory: [], benchmark: bench })
    expect(f.games.map((g) => g.durationMin)).toHaveLength(3)
    expect(f.games[0].win).toBeDefined()
  })

  it('tolerates an empty session without throwing', () => {
    const f = computeSessionFeatures({ matches: [], profile: null, lpHistory: [], benchmark: bench })
    expect(f.gameCount).toBe(0)
    expect(f.rank).toBeNull()
    expect(f.pool).toEqual([])
  })
})
