import { describe, it, expect, vi } from 'vitest'
import { FinalizeReflection } from '../../src/main/application/commands/FinalizeReflection'
import type { MatchCoachingModel, ReflectionProposal } from '../../src/main/application/ports/MatchCoachingModel'
import type { MatchAnalysis, StandingFocusTask } from '../../src/shared/types'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

const baseAnalysis: MatchAnalysis = {
  matchId: 'WIN_001', result: 'win',
  framing: null, narration: null,
  review: { verdict: { lead: 'Clean snowball.', gild: '' }, improve: 'Keep it up.', claims: [], cohort: 'vs general benchmark', benchmarkBasis: 'general', confidence: 'established' },
  tasks: { standing: [], sinceLast: [], firstTime: true },
  status: 'done', sections: { framing: 'skipped', narration: 'skipped', review: 'done', tasks: 'done' },
  lightModel: 'l', heavyModel: 'h', generatedAt: 1
}

function fakeModel(proposal: ReflectionProposal): MatchCoachingModel {
  return {
    analyzeFraming: vi.fn(), analyzeNarration: vi.fn(), analyzeReview: vi.fn(), analyzeTasks: vi.fn(),
    chat: vi.fn(),
    summarizeReflection: vi.fn().mockResolvedValue(proposal)
  } as unknown as MatchCoachingModel
}

function deps(model: MatchCoachingModel, standing: StandingFocusTask[], stored: MatchAnalysis | null) {
  const saved: StandingFocusTask[][] = []
  const retired: string[][] = []
  const upserts: MatchAnalysis[] = []
  const matchRepo = {
    getCurrentAccount: () => ({ puuid: PLAYER_PUUID, gameName: 'P', tagLine: 'EUW', platform: 'euw1', region: 'europe' }),
    getMatchDetail: () => ({ matchId: 'WIN_001', rawJson: JSON.stringify(loadMatch('WIN_001')) }),
    getTimeline: () => ({ matchId: 'WIN_001', rawJson: JSON.stringify(loadTimeline('WIN_001')) })
  } as never
  const reportRepo = {
    getMatchAnalysis: () => stored,
    upsertMatchAnalysis: (a: MatchAnalysis) => upserts.push(a),
    getStandingTasks: () => standing,
    saveStandingTasks: (_p: string, t: StandingFocusTask[]) => saved.push(t),
    retireStandingTasks: (ids: string[]) => retired.push(ids)
  } as never
  const goalRepo = { get: () => null } as never
  const cmd = new FinalizeReflection(matchRepo, reportRepo, goalRepo, model, 'haiku', () => 999)
  return { cmd, saved, retired, upserts }
}

describe('FinalizeReflection', () => {
  it('writes the reflection and adds a new focus task off the conversation', async () => {
    const proposal: ReflectionProposal = {
      reflection: 'I overstayed with a lead. Next game I recall earlier.',
      tasks: { set: [{ description: "Don't die alone.", metric: 'solo_deaths', comparator: '==', target: 0, scope: 'universal' }], retire: [] }
    }
    const { cmd, saved, upserts } = deps(fakeModel(proposal), [], baseAnalysis)
    const out = await cmd.execute('WIN_001', [{ role: 'user', text: 'I overstayed' }])

    expect(out.reflection).toContain('recall earlier')
    expect(out.tasksUpdated).toBe(true)
    expect(saved[0]).toHaveLength(1)
    expect(saved[0][0].metric).toBe('solo_deaths')
    // The stored read is patched so the report re-renders its focus section.
    expect(out.analysis?.tasks?.standing).toHaveLength(1)
    expect(upserts).toHaveLength(1)
  })

  it('does NOT wipe the standing tasks when the model returns an empty set', async () => {
    const standing: StandingFocusTask[] = [
      { id: 't1', description: "Don't die alone.", metric: 'solo_deaths', comparator: '==', target: 0, scope: 'universal', status: 'active', sourceMatchId: 'X' },
      { id: 't2', description: 'Hit 70 CS by 10.', metric: 'cs_at_10', comparator: '>=', target: 70, scope: 'role', role: 'Mid', status: 'active', sourceMatchId: 'X' }
    ]
    const proposal: ReflectionProposal = {
      reflection: 'Solid game, nothing to change.',
      tasks: { set: [], retire: [] } // light model often omits the existing tasks
    }
    const { cmd, saved, upserts } = deps(fakeModel(proposal), standing, baseAnalysis)
    const out = await cmd.execute('WIN_001', [{ role: 'user', text: 'good game' }])

    expect(out.tasksUpdated).toBe(false)
    expect(out.analysis).toBeNull()
    expect(saved).toHaveLength(0) // standing set preserved, nothing re-saved/wiped
    expect(upserts).toHaveLength(0)
  })

  it('retires a task by id without dropping the rest', async () => {
    const standing: StandingFocusTask[] = [
      { id: 't1', description: "Don't die alone.", metric: 'solo_deaths', comparator: '==', target: 0, scope: 'universal', status: 'active', sourceMatchId: 'X' },
      { id: 't2', description: 'Hit 70 CS by 10.', metric: 'cs_at_10', comparator: '>=', target: 70, scope: 'role', role: 'Mid', status: 'active', sourceMatchId: 'X' }
    ]
    const proposal: ReflectionProposal = {
      reflection: 'CS felt fine this game; I want to focus on staying alive.',
      tasks: { set: [], retire: ['t2'] }
    }
    const { cmd, saved } = deps(fakeModel(proposal), standing, baseAnalysis)
    const out = await cmd.execute('WIN_001', [{ role: 'user', text: 'retire cs' }])

    expect(out.tasksUpdated).toBe(true)
    expect(saved[0].map((t) => t.id)).toEqual(['t1']) // t2 retired, t1 kept
  })
})
