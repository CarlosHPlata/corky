import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/adapters/driven/sqlite/schema'
import { SqliteSessionGoalRepository } from '../../src/main/adapters/driven/sqlite/SqliteSessionGoalRepository'

let db: Database.Database
let repo: SqliteSessionGoalRepository

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = new SqliteSessionGoalRepository(db)
})

afterEach(() => {
  db.close()
})

describe('SqliteSessionGoalRepository', () => {
  it('returns null when nothing has been saved', () => {
    expect(repo.get()).toBeNull()
  })

  it('saves and retrieves the goal + notes', () => {
    const saved = repo.save({ goal: 'climb to gold', notes: 'ward more\ngroup at 15' }, 123)
    expect(saved).toEqual({ goal: 'climb to gold', notes: 'ward more\ngroup at 15', updatedAt: 123 })
    expect(repo.get()).toEqual({ goal: 'climb to gold', notes: 'ward more\ngroup at 15', updatedAt: 123 })
  })

  it('upserts in place — only one record is ever kept', () => {
    repo.save({ goal: 'first', notes: 'a' }, 1)
    repo.save({ goal: 'second', notes: 'b' }, 2)
    expect(repo.get()).toEqual({ goal: 'second', notes: 'b', updatedAt: 2 })
    const count = (db.prepare('SELECT COUNT(*) AS n FROM session_goal').get() as { n: number }).n
    expect(count).toBe(1)
  })

  it('persists a cleared goal (both fields empty) as a present row', () => {
    repo.save({ goal: 'something', notes: 'x' }, 1)
    repo.save({ goal: '', notes: '' }, 456)
    expect(repo.get()).toEqual({ goal: '', notes: '', updatedAt: 456 })
  })
})
