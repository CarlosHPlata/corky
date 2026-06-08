import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/adapters/driven/sqlite/schema'
import { SqliteMatchRepository } from '../../src/main/adapters/driven/sqlite/SqliteMatchRepository'
import type { Account, MatchSummary } from '../../src/shared/types'

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

const summary: MatchSummary = {
  matchId: 'KR_123456',
  puuid: 'puuid-123',
  queue: 420,
  champion: 'Ahri',
  win: true,
  gameCreation: 1700000000000,
  gameDuration: 1800
}

describe('SqliteMatchRepository', () => {
  it('upserts and retrieves an account', () => {
    repo.upsertAccount(account)
    expect(repo.getAccount(account.puuid)).toEqual(account)
  })

  it('returns null for unknown account', () => {
    expect(repo.getAccount('unknown')).toBeNull()
  })

  it('inserts a match and detects it as stored', () => {
    repo.insertMatch(summary, '{}')
    expect(repo.hasMatch(summary.matchId)).toBe(true)
  })

  it('hasMatch returns false for unknown match', () => {
    expect(repo.hasMatch('unknown')).toBe(false)
  })

  it('lists matches for a puuid ordered by game_creation desc', () => {
    const older: MatchSummary = { ...summary, matchId: 'KR_111', gameCreation: 100 }
    const newer: MatchSummary = { ...summary, matchId: 'KR_222', gameCreation: 200 }
    repo.insertMatch(older, '{}')
    repo.insertMatch(newer, '{}')
    const list = repo.listMatches(account.puuid)
    expect(list[0].matchId).toBe('KR_222')
    expect(list[1].matchId).toBe('KR_111')
  })

  it('insertMatch is idempotent (INSERT OR IGNORE)', () => {
    repo.insertMatch(summary, '{}')
    repo.insertMatch(summary, '{}')
    expect(repo.listMatches(account.puuid)).toHaveLength(1)
  })

  it('stores and retrieves a timeline', () => {
    repo.insertTimeline({ matchId: summary.matchId, rawJson: '{"frames":[]}' })
    expect(repo.getTimeline(summary.matchId)?.rawJson).toBe('{"frames":[]}')
  })
})
