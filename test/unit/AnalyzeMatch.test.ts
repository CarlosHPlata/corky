import { describe, it, expect, vi } from 'vitest'
import { AnalyzeMatch } from '../../src/main/application/commands/AnalyzeMatch'
import { MatchService } from '../../src/main/application/services/Match/MatchService'
import type { MatchCoachingModel, ReviewExtras } from '../../src/main/application/ports/MatchCoachingModel'
import type { MatchAnalysis, ReviewOutput } from '../../src/shared/types'
import type { CoachingConfigOverrides } from '../../src/shared/config'
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
    chatAgentic: vi.fn().mockResolvedValue({ reply: 'reply' }),
    planDiscovery: vi.fn().mockResolvedValue({ requests: [] }),
    summarizeReflectionText: vi.fn().mockRejectedValue(new Error('nope')),
    distillMemory: vi.fn().mockResolvedValue([]),
    ...over
  }
}

function deps(
  model: MatchCoachingModel,
  stored: MatchAnalysis | null = null,
  opts: { overrides?: CoachingConfigOverrides; goal?: string } = {}
) {
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
  const getChampionBenchmark = vi.fn().mockResolvedValue(null)
  const benchmarkSource = { getChampionBenchmark } as never
  const goalRepo = { get: () => (opts.goal ? { goal: opts.goal } : null) } as never
  // Default: no stored overrides ⇒ pure hardcoded defaults (all blocks/sources on).
  const coachingConfigRepo = { get: () => opts.overrides ?? null, save: () => {}, clear: () => {} } as never
  const reflectionRepo = { list: () => [] } as never
  const itemCatalog = { getItemNames: vi.fn().mockResolvedValue(new Map()) } as never
  const matchService = new MatchService(matchRepo, reportRepo, goalRepo, reflectionRepo, itemCatalog)
  const cmd = new AnalyzeMatch(
    matchRepo, summonerRepo, reportRepo, matchService, model, benchmarkSource, goalRepo, coachingConfigRepo,
    'haiku', 'opus', () => 123
  )
  return { cmd, upserts, getChampionBenchmark }
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
    const reportRepo = { getMatchAnalysis: () => null, upsertMatchAnalysis: () => {} } as never
    const goalRepo = { get: () => null } as never
    const reflectionRepo = { list: () => [] } as never
    const itemCatalog = { getItemNames: vi.fn().mockResolvedValue(new Map()) } as never
    const matchService = new MatchService(matchRepo, reportRepo, goalRepo, reflectionRepo, itemCatalog)
    const cmd = new AnalyzeMatch(
      matchRepo,
      { getProfile: () => null } as never,
      reportRepo,
      matchService,
      model,
      { getChampionBenchmark: vi.fn().mockResolvedValue(null) } as never,
      goalRepo,
      { get: () => null, save: () => {}, clear: () => {} } as never,
      'haiku', 'opus'
    )
    await expect(cmd.execute('NOPE')).rejects.toThrow()
  })

  it('keeps STAT and MARK lines in the context with the default config', async () => {
    const analyzeReview = vi.fn().mockResolvedValue(review)
    const { cmd } = deps(fakeModel({ analyzeReview }))
    await cmd.execute('WIN_001')
    const ctx = analyzeReview.mock.calls[0][0] as string
    expect(ctx).toContain('STAT ')
    expect(ctx).toContain('MARK ')
  })

  it('drops STAT lines when match.stats is disabled, keeping GAME/CORE', async () => {
    const analyzeReview = vi.fn().mockResolvedValue(review)
    const { cmd } = deps(fakeModel({ analyzeReview }), null, {
      overrides: { version: 1, blocks: { 'match.stats': false } }
    })
    await cmd.execute('WIN_001')
    const ctx = analyzeReview.mock.calls[0][0] as string
    expect(ctx).not.toContain('STAT ')
    expect(ctx).toContain('GAME result=')
    expect(ctx).toContain('CORE kda=')
  })

  it('never calls the benchmark source when opgg-mcp is disabled (general fallback)', async () => {
    const analyzeReview = vi.fn().mockResolvedValue(review)
    const { cmd, getChampionBenchmark } = deps(fakeModel({ analyzeReview }), null, {
      overrides: { version: 1, sources: { 'opgg-mcp': false } }
    })
    const a = await cmd.execute('WIN_001')
    expect(getChampionBenchmark).not.toHaveBeenCalled()
    expect(a.sections.review).toBe('done')
    const extras = analyzeReview.mock.calls[0][1] as ReviewExtras
    expect(extras.benchmark?.basis).toBe('general')
  })

  it('removes the goal NOTE line (and extras goal) when player.goal is disabled', async () => {
    const withGoal = vi.fn().mockResolvedValue(review)
    const on = deps(fakeModel({ analyzeReview: withGoal }), null, { goal: 'ward more' })
    await on.cmd.execute('WIN_001')
    expect(withGoal.mock.calls[0][0] as string).toContain('NOTE goal=')

    const withoutGoal = vi.fn().mockResolvedValue(review)
    const off = deps(fakeModel({ analyzeReview: withoutGoal }), null, {
      goal: 'ward more',
      overrides: { version: 1, blocks: { 'player.goal': false } }
    })
    await off.cmd.execute('WIN_001')
    expect(withoutGoal.mock.calls[0][0] as string).not.toContain('NOTE goal=')
    expect((withoutGoal.mock.calls[0][1] as ReviewExtras).goal).toBeUndefined()
  })
})
