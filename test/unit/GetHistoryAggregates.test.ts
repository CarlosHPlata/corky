import { describe, it, expect } from 'vitest'
import { GetHistoryAggregates } from '../../src/main/application/queries/GetHistoryAggregates'
import { MatchService } from '../../src/main/application/services/Match/MatchService'
import type { MatchRepository } from '../../src/main/application/ports/MatchRepository'
import { PLAYER_PUUID } from '../fixtures/load'

// Minimal raw match-v5 objects — just the fields the report extractors read.
function rawMatch(o: {
  matchId: string
  champion: string
  opponent: string
  win: boolean
  deaths: number
  gameCreation: number
}): string {
  return JSON.stringify({
    metadata: { matchId: o.matchId },
    info: {
      queueId: 420,
      gameCreation: o.gameCreation,
      gameDuration: 1800, // 30:00 ⇒ csPerMin = cs / 30
      participants: [
        {
          participantId: 1,
          puuid: PLAYER_PUUID,
          teamId: 100,
          teamPosition: 'MIDDLE',
          championName: o.champion,
          win: o.win,
          kills: 5,
          deaths: o.deaths,
          assists: 5,
          totalMinionsKilled: 180,
          neutralMinionsKilled: 0,
          goldEarned: 11000,
          visionScore: 20,
          challenges: { killParticipation: 0.5 }
        },
        {
          participantId: 6,
          puuid: 'PUUID_OPP',
          teamId: 200,
          teamPosition: 'MIDDLE',
          championName: o.opponent,
          win: !o.win,
          kills: 3,
          deaths: 5,
          assists: 2,
          totalMinionsKilled: 150,
          neutralMinionsKilled: 0,
          goldEarned: 9000,
          visionScore: 15
        }
      ]
    }
  })
}

function fakeRepo(details: { matchId: string; rawJson: string }[], account = true): MatchRepository {
  return {
    getCurrentAccount: () =>
      account
        ? { puuid: PLAYER_PUUID, gameName: 'P', tagLine: 'EUW', platform: 'euw1', region: 'europe' }
        : null,
    listMatchDetails: (_puuid: string, limit: number) => details.slice(0, limit),
    getMatchDetail: (matchId: string) => details.find((d) => d.matchId === matchId) ?? null,
    getTimeline: () => null // no timelines ⇒ timeline metrics degrade to null
  } as never
}

function fakeService(repo: MatchRepository): MatchService {
  const reportRepo = { getMatchAnalysis: () => null, getStandingTasks: () => [] } as never
  const goalRepo = { get: () => null } as never
  const reflectionRepo = { list: () => [] } as never
  const itemCatalog = { getItemNames: async () => new Map() } as never
  return new MatchService(repo, reportRepo, goalRepo, reflectionRepo, itemCatalog)
}

const TARGET = { champion: 'Ahri', role: 'Mid', opponentChampion: 'Zed' }

describe('GetHistoryAggregates', () => {
  it('builds rows from stored raw JSON and aggregates the cohort', async () => {
    const repo = fakeRepo([
      { matchId: 'M1', rawJson: rawMatch({ matchId: 'M1', champion: 'Ahri', opponent: 'Zed', win: true, deaths: 2, gameCreation: 3 }) },
      { matchId: 'M2', rawJson: rawMatch({ matchId: 'M2', champion: 'Ahri', opponent: 'Zed', win: true, deaths: 4, gameCreation: 2 }) },
      { matchId: 'M3', rawJson: rawMatch({ matchId: 'M3', champion: 'Ahri', opponent: 'Zed', win: false, deaths: 6, gameCreation: 1 }) }
    ])
    const agg = await new GetHistoryAggregates(repo, fakeService(repo)).execute(TARGET)
    expect(agg).not.toBeNull()
    expect(agg!.basis).toBe('matchup')
    expect(agg!.preferredWins).toBe(false) // only 2 wins
    expect(agg!.games).toBe(3)
    expect(agg!.averages.deaths).toBe(4)
    expect(agg!.averages.cs_per_min).toBe(6) // 180 CS / 30 min
    expect(agg!.averages.cs_at_10).toBeNull() // no timeline ⇒ never 0
  })

  it('excludes the analysed match from its own cohort', async () => {
    const repo = fakeRepo([
      { matchId: 'SELF', rawJson: rawMatch({ matchId: 'SELF', champion: 'Ahri', opponent: 'Zed', win: true, deaths: 99, gameCreation: 2 }) },
      { matchId: 'M1', rawJson: rawMatch({ matchId: 'M1', champion: 'Ahri', opponent: 'Zed', win: true, deaths: 3, gameCreation: 1 }) }
    ])
    const agg = await new GetHistoryAggregates(repo, fakeService(repo)).execute({ ...TARGET, excludeMatchId: 'SELF' })
    expect(agg!.games).toBe(1)
    expect(agg!.averages.deaths).toBe(3)
  })

  it('returns null when no account is synced or nothing is stored', async () => {
    const noAccount = fakeRepo([], false)
    expect(await new GetHistoryAggregates(noAccount, fakeService(noAccount)).execute(TARGET)).toBeNull()
    const empty = fakeRepo([])
    expect(await new GetHistoryAggregates(empty, fakeService(empty)).execute(TARGET)).toBeNull()
  })

  it('skips unparseable stored matches instead of failing', async () => {
    const repo = fakeRepo([
      { matchId: 'BAD', rawJson: 'not json' },
      { matchId: 'M1', rawJson: rawMatch({ matchId: 'M1', champion: 'Ahri', opponent: 'Zed', win: true, deaths: 3, gameCreation: 1 }) }
    ])
    const agg = await new GetHistoryAggregates(repo, fakeService(repo)).execute(TARGET)
    expect(agg!.games).toBe(1)
  })
})
