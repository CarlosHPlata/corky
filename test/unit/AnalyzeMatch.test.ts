import { describe, it, expect, vi } from 'vitest'
import { AnalyzeMatch } from '../../src/main/application/commands/AnalyzeMatch'
import type { MatchCoachingModel } from '../../src/main/application/ports/MatchCoachingModel'
import type { MatchAnalysis, ReviewOutput } from '../../src/shared/types'
import { loadMatch, loadTimeline, PLAYER_PUUID } from '../fixtures/load'

const review: ReviewOutput = {
  verdict: { lead: 'Even until 24, then you threw it.', gild: 'Two river deaths.' },
  improve: 'Group by 24:00 instead of roaming alone.',
  claims: [
    { text: 'real anchor', ref: { id: 'stat:gold_at_24', kind: 'stat' } },
    { text: 'invented anchor', ref: { id: 'marker:bogus#9', kind: 'marker' } }
  ],
  cohort: 'vs general benchmark',
  benchmarkBasis: 'general',
  confidence: 'established'
}

function fakeModel(over: Partial<MatchCoachingModel> = {}): MatchCoachingModel {
  return {
    analyzeFraming: vi.fn().mockRejectedValue(new Error('nope')),
    analyzeNarration: vi.fn().mockRejectedValue(new Error('nope')),
    analyzeReview: vi.fn().mockResolvedValue(review),
    analyzeTasks: vi.fn().mockRejectedValue(new Error('nope')),
    chat: vi.fn().mockResolvedValue('reply'),
    planDiscovery: vi.fn().mockResolvedValue({ requests: [] }),
    summarizeReflection: vi.fn().mockRejectedValue(new Error('nope')),
    ...over
  }
}

function deps(model: MatchCoachingModel, stored: MatchAnalysis | null = null) {
  const upserts: MatchAnalysis[] = []
  const matchRepo = {
    getCurrentAccount: () => ({ puuid: PLAYER_PUUID, gameName: 'P', tagLine: 'EUW', platform: 'euw1', region: 'europe' }),
    getMatchDetail: () => ({ matchId: 'WIN_001', rawJson: JSON.stringify(loadMatch('WIN_001')) }),
    getTimeline: () => ({ matchId: 'WIN_001', rawJson: JSON.stringify(loadTimeline('WIN_001')) })
  } as never
  const summonerRepo = { getProfile: () => ({ soloRank: { tier: 'GOLD' } }) } as never
  const reportRepo = {
    getMatchAnalysis: () => stored,
    upsertMatchAnalysis: (a: MatchAnalysis) => upserts.push(a),
    getStandingTasks: () => [],
    saveStandingTasks: () => {},
    retireStandingTasks: () => {},
    insertTaskEvaluation: () => {}
  } as never
  const benchmarkSource = { getChampionBenchmark: vi.fn().mockResolvedValue(null) } as never
  const goalRepo = { get: () => null } as never
  const cmd = new AnalyzeMatch(matchRepo, summonerRepo, reportRepo, model, benchmarkSource, goalRepo, 'haiku', 'opus', () => 123)
  return { cmd, upserts }
}

describe('AnalyzeMatch', () => {
  it('produces the verdict and marks unbuilt passes errored (partial)', async () => {
    const model = fakeModel()
    const { cmd, upserts } = deps(model)
    const a = await cmd.execute('WIN_001')
    expect(a.review?.verdict.lead).toContain('threw it')
    expect(a.sections.review).toBe('done')
    expect(a.sections.framing).toBe('error')
    expect(a.status).toBe('partial')
    expect(upserts).toHaveLength(1)
    expect(a.generatedAt).toBe(123)
  })

  it('drops off-catalog claims from the review (FR-007)', async () => {
    const { cmd } = deps(fakeModel())
    const a = await cmd.execute('WIN_001')
    expect(a.review!.claims).toHaveLength(1)
    expect(a.review!.claims[0].ref.id).toBe('stat:gold_at_24')
  })

  it('feeds the review a compact context, not raw JSON (SC-007)', async () => {
    const analyzeReview = vi.fn().mockResolvedValue(review)
    const { cmd } = deps(fakeModel({ analyzeReview }))
    await cmd.execute('WIN_001')
    const ctx = analyzeReview.mock.calls[0][0] as string
    expect(ctx).toContain('GAME result=win')
    expect(ctx.trim().startsWith('{')).toBe(false)
  })

  it('reuses a stored done section instead of re-running it', async () => {
    const stored: MatchAnalysis = {
      matchId: 'WIN_001', result: 'win', framing: null, narration: null,
      review, tasks: null, status: 'partial',
      sections: { framing: 'error', narration: 'error', review: 'done', tasks: 'error' },
      lightModel: 'haiku', heavyModel: 'opus', generatedAt: 1
    }
    const analyzeReview = vi.fn().mockResolvedValue(review)
    const { cmd } = deps(fakeModel({ analyzeReview }), stored)
    await cmd.execute('WIN_001') // not forced
    expect(analyzeReview).not.toHaveBeenCalled()
  })

  it('throws when the match is not stored', async () => {
    const model = fakeModel()
    const matchRepo = {
      getCurrentAccount: () => ({ puuid: PLAYER_PUUID }),
      getMatchDetail: () => null,
      getTimeline: () => null
    } as never
    const cmd = new AnalyzeMatch(
      matchRepo,
      { getProfile: () => null } as never,
      { getMatchAnalysis: () => null, upsertMatchAnalysis: () => {} } as never,
      model,
      { getChampionBenchmark: vi.fn().mockResolvedValue(null) } as never,
      { get: () => null } as never,
      'haiku', 'opus'
    )
    await expect(cmd.execute('NOPE')).rejects.toThrow()
  })
})
