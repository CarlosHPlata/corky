import { describe, it, expect, vi } from 'vitest'
import { AnalyzeSession } from '../../src/main/application/commands/AnalyzeSession'
import { GetSessionAnalysis } from '../../src/main/application/queries/GetSessionAnalysis'
import type { MatchRepository } from '../../src/main/application/ports/MatchRepository'
import type { SummonerRepository } from '../../src/main/application/ports/SummonerRepository'
import type { SessionAnalysisRepository } from '../../src/main/application/ports/SessionAnalysisRepository'
import type { SessionCoachingModel } from '../../src/main/application/ports/SessionCoachingModel'
import type { BenchmarkDataSource } from '../../src/main/application/ports/BenchmarkDataSource'
import type { SessionGoalRepository } from '../../src/main/application/ports/SessionGoalRepository'
import type { Account, MatchSummary, SessionAnalysis, SessionGoal } from '../../src/shared/types'

const account: Account = { puuid: 'me', gameName: 'C', tagLine: 'EUW', platform: 'euw1', region: 'europe' }

function match(o: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: o.matchId ?? Math.random().toString(36), puuid: 'me', queue: 420,
    champion: o.champion ?? 'Ahri', role: o.role ?? 'Mid', win: o.win ?? true,
    kills: 8, deaths: 4, assists: 6, cs: 200, csPerMin: 7, gold: 12000, goldPerMin: 400,
    gameCreation: o.gameCreation ?? 1_700_000_000_000, gameDuration: 1800
  }
}

function fakeMatchRepo(matches: MatchSummary[], acct: Account | null = account): MatchRepository {
  return { getCurrentAccount: () => acct, listMatches: () => matches } as unknown as MatchRepository
}
function fakeSummonerRepo(): SummonerRepository {
  return { getProfile: () => null, getLpHistory: () => [] } as unknown as SummonerRepository
}
function fakeAnalysisRepo(): SessionAnalysisRepository & { saved: Array<[string, SessionAnalysis]> } {
  const saved: Array<[string, SessionAnalysis]> = []
  return {
    saved,
    save: (puuid, a) => { saved.push([puuid, a]) },
    getLatest: () => (saved.length ? saved[saved.length - 1][1] : null)
  }
}
const okModel: SessionCoachingModel = {
  analyzeSession: async () => ({
    insights: [{ leak: 'deaths', headline: 'h', body: 'b', evidence: 'e', benchmarkBasis: null, confidence: 'established' }],
    noData: false
  })
}

function fakeGoalRepo(goal: SessionGoal | null): SessionGoalRepository {
  return { get: () => goal, save: (v, at) => ({ ...v, updatedAt: at }) }
}

describe('AnalyzeSession', () => {
  it('returns noData without calling the model when below the game threshold', async () => {
    const model = { analyzeSession: vi.fn() } as unknown as SessionCoachingModel
    const cmd = new AnalyzeSession(fakeMatchRepo([match(), match()]), fakeSummonerRepo(), fakeAnalysisRepo(), model, 'm')
    const out = await cmd.execute()
    expect(out.noData).toBe(true)
    expect(out.insights).toEqual([])
    expect(model.analyzeSession).not.toHaveBeenCalled()
  })

  it('generates and persists the latest analysis when there are enough games', async () => {
    const repo = fakeAnalysisRepo()
    const cmd = new AnalyzeSession(fakeMatchRepo([match(), match(), match()]), fakeSummonerRepo(), repo, okModel, 'm')
    const out = await cmd.execute()
    expect(out.insights).toHaveLength(1)
    expect(repo.saved).toHaveLength(1)
    expect(repo.saved[0][0]).toBe('me')
  })

  it('never overwrites a stored analysis with a noData run', async () => {
    const repo = fakeAnalysisRepo()
    const cmd = new AnalyzeSession(fakeMatchRepo([match()]), fakeSummonerRepo(), repo, okModel, 'm')
    await cmd.execute()
    expect(repo.saved).toHaveLength(0)
  })

  it('uses the OP.GG champion benchmark when available', async () => {
    const benchmark: BenchmarkDataSource = {
      getChampionBenchmark: vi.fn().mockResolvedValue({ basis: 'champion_patch', csPerMin: 7.4, deathsCeiling: 5 })
    }
    const cmd = new AnalyzeSession(fakeMatchRepo([match(), match(), match()]), fakeSummonerRepo(), fakeAnalysisRepo(), okModel, 'm', benchmark)
    const out = await cmd.execute()
    expect(out.benchmarkBasisUsed).toBe('champion_patch')
    // COMPLIANCE (US4): only champion/role/tier are sent to OP.GG — no player/enemy data.
    expect(benchmark.getChampionBenchmark).toHaveBeenCalledWith({ champion: 'Ahri', role: 'Mid', tier: null })
  })

  it('falls back to the general benchmark when OP.GG returns null', async () => {
    const benchmark: BenchmarkDataSource = { getChampionBenchmark: vi.fn().mockResolvedValue(null) }
    const cmd = new AnalyzeSession(fakeMatchRepo([match(), match(), match()]), fakeSummonerRepo(), fakeAnalysisRepo(), okModel, 'm', benchmark)
    const out = await cmd.execute()
    expect(out.benchmarkBasisUsed).toBe('general')
  })

  it('does not fail the analysis when the benchmark source throws', async () => {
    const benchmark: BenchmarkDataSource = { getChampionBenchmark: vi.fn().mockRejectedValue(new Error('opgg down')) }
    const cmd = new AnalyzeSession(fakeMatchRepo([match(), match(), match()]), fakeSummonerRepo(), fakeAnalysisRepo(), okModel, 'm', benchmark)
    const out = await cmd.execute()
    expect(out.benchmarkBasisUsed).toBe('general')
    expect(out.insights).toHaveLength(1)
  })

  it('propagates a coaching-model failure (renderer maps it to a retryable error)', async () => {
    const model: SessionCoachingModel = { analyzeSession: async () => { throw new Error('LLM down') } }
    const cmd = new AnalyzeSession(fakeMatchRepo([match(), match(), match()]), fakeSummonerRepo(), fakeAnalysisRepo(), model, 'm')
    await expect(cmd.execute()).rejects.toThrow()
  })

  it('forwards the saved goal + notes to the model as player intent (US2)', async () => {
    const model = { analyzeSession: vi.fn().mockResolvedValue({ insights: [], noData: false }) } as unknown as SessionCoachingModel
    const goal: SessionGoal = { goal: 'close my leads', notes: 'group at 15', updatedAt: 1 }
    const cmd = new AnalyzeSession(
      fakeMatchRepo([match(), match(), match()]), fakeSummonerRepo(), fakeAnalysisRepo(), model, 'm', null, fakeGoalRepo(goal)
    )
    await cmd.execute()
    expect(model.analyzeSession).toHaveBeenCalledTimes(1)
    const [, , playerContext] = (model.analyzeSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(playerContext).toEqual({ goal: 'close my leads', notes: 'group at 15' })
  })

  it('passes no player context when the goal is empty or absent (US3 — honest, unchanged)', async () => {
    const model = { analyzeSession: vi.fn().mockResolvedValue({ insights: [], noData: false }) } as unknown as SessionCoachingModel
    const matches = [match(), match(), match()]
    // empty goal
    const a = new AnalyzeSession(fakeMatchRepo(matches), fakeSummonerRepo(), fakeAnalysisRepo(), model, 'm', null, fakeGoalRepo({ goal: '', notes: '', updatedAt: 1 }))
    await a.execute()
    expect((model.analyzeSession as ReturnType<typeof vi.fn>).mock.calls[0][2]).toBeUndefined()
    // no goal repo at all
    const b = new AnalyzeSession(fakeMatchRepo(matches), fakeSummonerRepo(), fakeAnalysisRepo(), model, 'm')
    await b.execute()
    expect((model.analyzeSession as ReturnType<typeof vi.fn>).mock.calls[1][2]).toBeUndefined()
  })
})

describe('GetSessionAnalysis', () => {
  it('returns null when no account is synced', () => {
    const q = new GetSessionAnalysis(fakeMatchRepo([], null), fakeAnalysisRepo())
    expect(q.execute()).toBeNull()
  })

  it('returns the persisted analysis for the current account', () => {
    const repo = fakeAnalysisRepo()
    const stored: SessionAnalysis = { insights: [], noData: false, benchmarkBasisUsed: 'general', generatedAt: 1, model: 'm' }
    repo.save('me', stored)
    const q = new GetSessionAnalysis(fakeMatchRepo([]), repo)
    expect(q.execute()).toEqual(stored)
  })
})
