import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/adapters/driven/sqlite/schema'
import { SqliteReportRepository } from '../../src/main/adapters/driven/sqlite/SqliteReportRepository'
import type { FocusTask } from '../../src/shared/types'

let db: Database.Database
let repo: SqliteReportRepository

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = new SqliteReportRepository(db)
})

afterEach(() => {
  db.close()
})

describe('SqliteReportRepository', () => {
  it('inserts and retrieves a coach report', () => {
    const id = repo.insertReport({
      matchId: 'KR_001',
      createdAt: 1700000000,
      model: 'claude-sonnet-4-6',
      content: 'You died too much.'
    })
    expect(id).toBeGreaterThan(0)
    const report = repo.getReport('KR_001')
    expect(report?.content).toBe('You died too much.')
  })

  it('returns null for missing report', () => {
    expect(repo.getReport('missing')).toBeNull()
  })

  it('inserts and retrieves focus tasks', () => {
    const tasks: FocusTask[] = [
      {
        id: 'task-1',
        matchId: 'KR_001',
        description: 'Hit 70 CS by 10 minutes',
        metric: 'cs_at_10',
        comparator: '>=',
        target: 70,
        scope: 'role'
      }
    ]
    repo.insertFocusTasks(tasks)
    const stored = repo.getFocusTasks('KR_001')
    expect(stored).toHaveLength(1)
    expect(stored[0].metric).toBe('cs_at_10')
    expect(stored[0].target).toBe(70)
  })

  it('inserts and retrieves task evaluations', () => {
    repo.insertTaskEvaluation({
      taskId: 'task-1',
      evaluatingMatchId: 'KR_002',
      result: 'improved',
      actualValue: 75
    })
    const evals = repo.getTaskEvaluations('KR_002')
    expect(evals).toHaveLength(1)
    expect(evals[0].result).toBe('improved')
    expect(evals[0].actualValue).toBe(75)
  })
})
