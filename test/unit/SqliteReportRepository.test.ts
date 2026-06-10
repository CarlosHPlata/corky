import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/adapters/driven/sqlite/schema'
import { SqliteReportRepository } from '../../src/main/adapters/driven/sqlite/SqliteReportRepository'
import type { FocusTask, MatchAnalysis } from '../../src/shared/types'

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

  it('lists evaluations for the given tasks, newest evaluating game first', () => {
    const insertMatch = db.prepare(
      `INSERT INTO matches (match_id, puuid, queue, champion, win, game_creation, game_duration, raw_json)
       VALUES (?, 'p1', 420, 'Ahri', 1, ?, 1800, '{}')`
    )
    insertMatch.run('KR_OLD', 1000)
    insertMatch.run('KR_NEW', 3000)
    insertMatch.run('KR_MID', 2000)
    repo.insertTaskEvaluation({ taskId: 'task-1', evaluatingMatchId: 'KR_OLD', result: 'regressed', actualValue: null })
    repo.insertTaskEvaluation({ taskId: 'task-1', evaluatingMatchId: 'KR_NEW', result: 'improved', actualValue: 80 })
    repo.insertTaskEvaluation({ taskId: 'task-2', evaluatingMatchId: 'KR_MID', result: 'held', actualValue: null })
    repo.insertTaskEvaluation({ taskId: 'other', evaluatingMatchId: 'KR_NEW', result: 'improved', actualValue: null })

    const evals = repo.listTaskEvaluations(['task-1', 'task-2'])
    expect(evals.map((e) => e.evaluatingMatchId)).toEqual(['KR_NEW', 'KR_MID', 'KR_OLD'])
    expect(evals.map((e) => e.result)).toEqual(['improved', 'held', 'regressed'])
    expect(repo.listTaskEvaluations([])).toEqual([])
  })

  it('counts stored match analyses', () => {
    const analysis = (matchId: string): MatchAnalysis => ({
      matchId, result: 'win', framing: null, narration: null, review: null, tasks: null,
      status: 'done',
      sections: { framing: 'done', narration: 'done', review: 'done', tasks: 'done' },
      lightModel: 'light', heavyModel: 'heavy', generatedAt: 1700000000
    })
    expect(repo.countMatchAnalyses()).toBe(0)
    repo.upsertMatchAnalysis(analysis('KR_001'))
    repo.upsertMatchAnalysis(analysis('KR_002'))
    repo.upsertMatchAnalysis(analysis('KR_002')) // re-run replaces, not duplicates
    expect(repo.countMatchAnalyses()).toBe(2)
  })
})
