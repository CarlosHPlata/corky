import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/adapters/driven/sqlite/schema'
import { SqliteSessionAnalysisRepository } from '../../src/main/adapters/driven/sqlite/SqliteSessionAnalysisRepository'
import type { SessionAnalysis } from '../../src/shared/types'

let db: Database.Database
let repo: SqliteSessionAnalysisRepository

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = new SqliteSessionAnalysisRepository(db)
})

afterEach(() => {
  db.close()
})

const analysis = (over: Partial<SessionAnalysis> = {}): SessionAnalysis => ({
  insights: [
    {
      leak: 'deaths',
      headline: "You're feeding the games you lose",
      body: 'No solo river deaths without vision.',
      evidence: 'losses 8.7 dpg',
      benchmarkBasis: 'rank_general',
      confidence: 'established'
    }
  ],
  noData: false,
  benchmarkBasisUsed: 'general',
  generatedAt: 1_749_470_000_000,
  model: 'claude-sonnet-4-6',
  ...over
})

describe('SqliteSessionAnalysisRepository', () => {
  it('returns null when nothing is stored for the account', () => {
    expect(repo.getLatest('puuid-1')).toBeNull()
  })

  it('saves and retrieves an analysis by account', () => {
    repo.save('puuid-1', analysis())
    const got = repo.getLatest('puuid-1')
    expect(got?.insights).toHaveLength(1)
    expect(got?.insights[0].leak).toBe('deaths')
    expect(got?.model).toBe('claude-sonnet-4-6')
  })

  it('keeps only the latest analysis per account (upsert)', () => {
    repo.save('puuid-1', analysis({ generatedAt: 1 }))
    repo.save('puuid-1', analysis({ generatedAt: 2, benchmarkBasisUsed: 'champion_patch' }))
    const got = repo.getLatest('puuid-1')
    expect(got?.generatedAt).toBe(2)
    expect(got?.benchmarkBasisUsed).toBe('champion_patch')
  })

  it('isolates analyses per account', () => {
    repo.save('puuid-1', analysis({ model: 'a' }))
    repo.save('puuid-2', analysis({ model: 'b' }))
    expect(repo.getLatest('puuid-1')?.model).toBe('a')
    expect(repo.getLatest('puuid-2')?.model).toBe('b')
  })
})
