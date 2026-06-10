import { describe, it, expect } from 'vitest'
import { evaluateTask } from '../../src/main/domain/report/taskEvaluation'
import { enforceStandingSet, isValidTask } from '../../src/main/domain/report/focusTask'
import { assembleMatchReport } from '../../src/main/domain/report/assembleMatchReport'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'
import type { StandingFocusTask } from '../../src/shared/types'

const win = assembleMatchReport(loadMatch('WIN_001'), loadTimeline('WIN_001'), PLAYER_PUUID)

function task(o: Partial<StandingFocusTask> = {}): StandingFocusTask {
  return {
    id: 't', description: 'task', metric: 'solo_deaths', comparator: '==', target: 0,
    scope: 'universal', status: 'active', sourceMatchId: 'M', ...o
  }
}

describe('evaluateTask', () => {
  it('parks a task whose champion scope does not match (not failure)', () => {
    const t = task({ scope: 'champion', champion: 'Garen', metric: 'cs_at_10', comparator: '>=', target: 70 })
    expect(evaluateTask(t, win).result).toBe('not_applicable')
  })

  it('parks a task whose metric was not reached', () => {
    const t = task({ metric: 'gold_at_24', comparator: '>=', target: 0 })
    const short = assembleMatchReport(loadMatch('SHORT_003'), loadTimeline('SHORT_003'), PLAYER_PUUID)
    expect(evaluateTask(t, short).result).toBe('not_applicable')
  })

  it('holds when the task still meets target (no prior)', () => {
    const t = task({ metric: 'cs_at_10', comparator: '>=', target: 0 })
    expect(evaluateTask(t, win).result).toBe('held')
  })

  it('improves when it newly meets the target vs a failing prior', () => {
    const cs = win.breakdown.csAt10 ?? 80
    const t = task({ metric: 'cs_at_10', comparator: '>=', target: cs })
    expect(evaluateTask(t, win, cs - 20).result).toBe('improved')
  })

  it('regresses when it no longer meets a previously-met target', () => {
    const t = task({ metric: 'cs_at_10', comparator: '>=', target: 9999 })
    expect(evaluateTask(t, win, 99999).result).toBe('regressed')
  })
})

describe('enforceStandingSet', () => {
  it('drops non-computable metrics and clamps to three', () => {
    const tasks = [
      task({ id: '1' }),
      task({ id: '2', metric: 'bogus_metric' as never }),
      task({ id: '3' }), task({ id: '4' }), task({ id: '5' })
    ]
    const out = enforceStandingSet(tasks)
    expect(out).toHaveLength(3)
    expect(out.find((t) => t.id === '2')).toBeUndefined()
  })

  it('validates scope has the required field', () => {
    expect(isValidTask({ description: 'x', metric: 'cs_at_10', comparator: '>=', target: 70, scope: 'champion' })).toBe(false)
    expect(isValidTask({ description: 'x', metric: 'cs_at_10', comparator: '>=', target: 70, scope: 'champion', champion: 'Ahri' })).toBe(true)
  })
})
