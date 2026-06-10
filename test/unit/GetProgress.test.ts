import { describe, it, expect } from 'vitest'
import { GetProgress } from '../../src/main/application/queries/GetProgress'
import type { SemanticObject } from '../../src/main/domain/memory/semanticObject'
import type { SemanticMemoryFilter } from '../../src/main/application/ports/SemanticMemory'
import type { StandingFocusTask, TaskEvaluation, TaskEvaluationResult } from '../../src/shared/types'

const ACCOUNT = { puuid: 'puuid-1', gameName: 'P', tagLine: 'EUW', platform: 'euw1', region: 'europe' }

function task(id: string): StandingFocusTask {
  return {
    id, description: `do ${id}`, metric: 'cs_at_10', comparator: '>=', target: 70,
    scope: 'role', status: 'active', sourceMatchId: 'M_SRC'
  }
}

/** Newest-first, as the repo contract returns them. */
function evals(taskId: string, results: TaskEvaluationResult[]): TaskEvaluation[] {
  return results.map((result, i) => ({
    taskId, evaluatingMatchId: `M_${i}`, result, actualValue: null
  }))
}

function memObj(over: Partial<SemanticObject>): SemanticObject {
  return {
    id: 'o1', kind: 'pattern', statement: 'stmt', evidenceMatchIds: [],
    occurrences: 1, firstSeen: 1, lastSeen: 1, status: 'active', ...over
  }
}

/** Filters + orders like the sqlite adapter: kinds/statuses, occurrences desc
 * then lastSeen desc, capped at `limit`. */
function fakeMemory(objects: SemanticObject[]) {
  return {
    upsert: () => {},
    setStatus: () => {},
    query: (f: SemanticMemoryFilter) =>
      objects
        .filter((o) => (f.kinds ? f.kinds.includes(o.kind) : true))
        .filter((o) =>
          f.statuses?.length ? f.statuses.includes(o.status) : ['active', 'confirmed'].includes(o.status)
        )
        .sort((a, b) => b.occurrences - a.occurrences || b.lastSeen - a.lastSeen)
        .slice(0, f.limit ?? 12)
  }
}

function build(opts: {
  account?: typeof ACCOUNT | null
  tasks?: StandingFocusTask[]
  evaluations?: TaskEvaluation[]
  memory?: SemanticObject[]
  analysedGames?: number
} = {}) {
  const matchRepo = {
    getCurrentAccount: () => (opts.account === undefined ? ACCOUNT : opts.account)
  } as never
  const reportRepo = {
    getStandingTasks: () => opts.tasks ?? [],
    listTaskEvaluations: (ids: string[]) =>
      (opts.evaluations ?? []).filter((e) => ids.includes(e.taskId)),
    countMatchAnalyses: () => opts.analysedGames ?? 0
  } as never
  return new GetProgress(matchRepo, reportRepo, fakeMemory(opts.memory ?? []) as never)
}

describe('GetProgress', () => {
  it('returns an empty summary (never throws) when no account is synced', () => {
    const out = build({ account: null, analysedGames: 9 }).execute()
    expect(out).toEqual({ tasks: [], working: [], wins: [], analysedGames: 0 })
  })

  it('counts the streak from the newest evaluation: improved,improved,regressed → 2', () => {
    const out = build({
      tasks: [task('t1')],
      evaluations: evals('t1', ['improved', 'improved', 'regressed', 'improved'])
    }).execute()
    expect(out.tasks[0].streak).toBe(2)
  })

  it("counts 'held' toward the streak and breaks on anything else", () => {
    const out = build({
      tasks: [task('t1')],
      evaluations: evals('t1', ['held', 'improved', 'not_applicable', 'improved'])
    }).execute()
    expect(out.tasks[0].streak).toBe(2)
  })

  it('caps recent at 5 newest-first while the streak spans the full history', () => {
    const out = build({
      tasks: [task('t1')],
      evaluations: evals('t1', ['improved', 'held', 'improved', 'improved', 'held', 'improved', 'regressed'])
    }).execute()
    expect(out.tasks[0].recent).toEqual(['improved', 'held', 'improved', 'improved', 'held'])
    expect(out.tasks[0].streak).toBe(6)
  })

  it('keeps each standing task with its own evaluations; none yet ⇒ empty row, streak 0', () => {
    const out = build({
      tasks: [task('t1'), task('t2')],
      evaluations: evals('t1', ['regressed', 'improved'])
    }).execute()
    expect(out.tasks).toHaveLength(2)
    expect(out.tasks[0]).toEqual({
      taskId: 't1', description: 'do t1', metric: 'cs_at_10',
      recent: ['regressed', 'improved'], streak: 0
    })
    expect(out.tasks[1]).toEqual({
      taskId: 't2', description: 'do t2', metric: 'cs_at_10', recent: [], streak: 0
    })
  })

  it('working = active/confirmed patterns + weaknesses, occurrences-descending, capped at 4', () => {
    const out = build({
      memory: [
        memObj({ id: 'w1', kind: 'weakness', statement: 'w 5x', occurrences: 5 }),
        memObj({ id: 'p1', kind: 'pattern', statement: 'p 3x', occurrences: 3, status: 'confirmed' }),
        memObj({ id: 'p2', kind: 'pattern', statement: 'p 2x', occurrences: 2 }),
        memObj({ id: 'p3', kind: 'pattern', statement: 'p 1x', occurrences: 1 }),
        memObj({ id: 'p4', kind: 'pattern', statement: 'p 1x late', occurrences: 1 }),
        memObj({ id: 'x1', kind: 'strength', statement: 'not working', occurrences: 9 }),
        memObj({ id: 'x2', kind: 'pattern', statement: 'resolved out', occurrences: 9, status: 'resolved' })
      ]
    }).execute()
    expect(out.working).toHaveLength(4)
    expect(out.working.map((w) => w.statement)).toEqual(['w 5x', 'p 3x', 'p 2x', 'p 1x'])
    expect(out.working[0]).toEqual({ statement: 'w 5x', kind: 'weakness', occurrences: 5 })
  })

  it('wins = resolved objects of any kind plus active milestones, newest lastSeen first, capped at 4', () => {
    const out = build({
      memory: [
        memObj({ id: 'r1', kind: 'weakness', statement: 'fixed deaths', status: 'resolved', lastSeen: 50 }),
        memObj({ id: 'm1', kind: 'milestone', statement: 'hit gold', status: 'active', lastSeen: 90 }),
        memObj({ id: 'r2', kind: 'pattern', statement: 'fixed wards', status: 'resolved', lastSeen: 70, occurrences: 9 }),
        memObj({ id: 'r3', kind: 'strength', statement: 'older win', status: 'resolved', lastSeen: 10 }),
        memObj({ id: 'r4', kind: 'pattern', statement: 'oldest win', status: 'resolved', lastSeen: 5 }),
        memObj({ id: 'x1', kind: 'pattern', statement: 'still open', status: 'active', lastSeen: 99 })
      ]
    }).execute()
    expect(out.wins).toEqual([
      { statement: 'hit gold', kind: 'milestone' },
      { statement: 'fixed wards', kind: 'pattern' },
      { statement: 'fixed deaths', kind: 'weakness' },
      { statement: 'older win', kind: 'strength' }
    ])
  })

  it('passes the analysed-games count through', () => {
    expect(build({ analysedGames: 7 }).execute().analysedGames).toBe(7)
  })
})
