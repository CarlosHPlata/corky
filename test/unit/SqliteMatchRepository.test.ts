import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/adapters/driven/sqlite/schema'
import { SqliteMatchRepository } from '../../src/main/adapters/driven/sqlite/SqliteMatchRepository'
import { extractMatchSummary } from '../../src/main/domain/matchSummary'
import type { Account } from '../../src/shared/types'

let db: Database.Database
let repo: SqliteMatchRepository

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = new SqliteMatchRepository(db)
})

afterEach(() => {
  db.close()
})

const account: Account = {
  puuid: 'puuid-123',
  gameName: 'Faker',
  tagLine: 'KR1',
  platform: 'kr',
  region: 'asia'
}

function buildRaw(matchId: string, puuid: string, gameCreation = 1700000000000) {
  return {
    metadata: { matchId },
    info: {
      queueId: 420,
      gameCreation,
      gameDuration: 1800,
      participants: [
        {
          puuid,
          championName: 'Ahri',
          win: true,
          kills: 5,
          deaths: 3,
          assists: 7,
          totalMinionsKilled: 200,
          neutralMinionsKilled: 0,
          goldEarned: 12000,
          teamPosition: 'MIDDLE'
        }
      ]
    }
  }
}

function store(matchId: string, gameCreation?: number) {
  const raw = buildRaw(matchId, account.puuid, gameCreation)
  repo.insertMatch(extractMatchSummary(raw, account.puuid), JSON.stringify(raw))
}

describe('SqliteMatchRepository', () => {
  it('upserts and retrieves an account', () => {
    repo.upsertAccount(account)
    expect(repo.getAccount(account.puuid)).toEqual(account)
  })

  it('returns null for unknown account', () => {
    expect(repo.getAccount('unknown')).toBeNull()
  })

  it('getCurrentAccount returns the single stored account', () => {
    expect(repo.getCurrentAccount()).toBeNull()
    repo.upsertAccount(account)
    expect(repo.getCurrentAccount()).toEqual(account)
  })

  it('inserts a match and detects it as stored', () => {
    store('KR_123456')
    expect(repo.hasMatch('KR_123456')).toBe(true)
  })

  it('hasMatch returns false for unknown match', () => {
    expect(repo.hasMatch('unknown')).toBe(false)
  })

  it('lists matches for a puuid ordered by game_creation desc', () => {
    store('KR_111', 100)
    store('KR_222', 200)
    const list = repo.listMatches(account.puuid)
    expect(list[0].matchId).toBe('KR_222')
    expect(list[1].matchId).toBe('KR_111')
  })

  it('reconstructs enriched fields from stored raw json', () => {
    store('KR_123456')
    const [m] = repo.listMatches(account.puuid)
    expect(m).toMatchObject({
      matchId: 'KR_123456',
      champion: 'Ahri',
      role: 'Mid',
      win: true,
      kills: 5,
      deaths: 3,
      assists: 7,
      cs: 200
    })
  })

  it('insertMatch is idempotent (INSERT OR IGNORE)', () => {
    store('KR_123456')
    store('KR_123456')
    expect(repo.listMatches(account.puuid)).toHaveLength(1)
  })

  it('stores and retrieves a timeline', () => {
    repo.insertTimeline({ matchId: 'KR_123456', rawJson: '{"frames":[]}' })
    expect(repo.getTimeline('KR_123456')?.rawJson).toBe('{"frames":[]}')
  })
})
