import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import type { CoachingConfigOverrides } from '@shared/config'
import { runMigrations } from '../../src/main/adapters/driven/sqlite/schema'
import { SqliteCoachingConfigRepository } from '../../src/main/adapters/driven/sqlite/SqliteCoachingConfigRepository'

let db: Database.Database
let repo: SqliteCoachingConfigRepository

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = new SqliteCoachingConfigRepository(db)
})

afterEach(() => {
  db.close()
})

const OVERRIDES: CoachingConfigOverrides = {
  version: 1,
  sources: { 'riot-agent-lookups': true },
  blocks: { 'match.stats': false },
  budgetTier: 'eco'
}

describe('SqliteCoachingConfigRepository', () => {
  it('returns null when nothing has been saved', () => {
    expect(repo.get()).toBeNull()
  })

  it('saves and retrieves the overrides record', () => {
    repo.save(OVERRIDES)
    expect(repo.get()).toEqual(OVERRIDES)
  })

  it('clear removes the record — back to null', () => {
    repo.save(OVERRIDES)
    repo.clear()
    expect(repo.get()).toBeNull()
    // Clearing an already-empty store is a no-op, not an error.
    expect(() => repo.clear()).not.toThrow()
  })

  it('upserts in place — only one record is ever kept', () => {
    repo.save(OVERRIDES)
    repo.save({ version: 1, budgetTier: 'deep' })
    expect(repo.get()).toEqual({ version: 1, budgetTier: 'deep' })
    const count = (db.prepare('SELECT COUNT(*) AS n FROM coaching_config').get() as { n: number })
      .n
    expect(count).toBe(1)
  })

  it('tolerates corrupt JSON — reads as null instead of throwing', () => {
    db.prepare('INSERT INTO coaching_config (id, json, updated_at) VALUES (1, ?, ?)').run(
      'not {json',
      123
    )
    expect(repo.get()).toBeNull()
    // And a subsequent save repairs the row.
    repo.save(OVERRIDES)
    expect(repo.get()).toEqual(OVERRIDES)
  })
})
