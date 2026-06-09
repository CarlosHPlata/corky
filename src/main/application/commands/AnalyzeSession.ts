import type { SessionAnalysis } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { SummonerRepository } from '../ports/SummonerRepository'
import type { SessionCoachingModel, PlayerContext } from '../ports/SessionCoachingModel'
import type { SessionAnalysisRepository } from '../ports/SessionAnalysisRepository'
import type { BenchmarkDataSource } from '../ports/BenchmarkDataSource'
import type { SessionGoalRepository } from '../ports/SessionGoalRepository'
import { computeSessionFeatures, topChampionRole } from '../../domain/sessionFeatures'
import { resolveGeneralBenchmark } from '../../domain/benchmark'
import { hasContent } from '../../domain/sessionGoal'

/** Below this many games we decline to read a pattern (honest about limits). */
const MIN_GAMES = 3

/**
 * Generates the Quick Analysis on demand and persists the latest per account.
 * Reads the player's own local data, resolves a benchmark, computes the session
 * signals, and has the coaching model diagnose them. The result is saved (per
 * puuid) so it survives resync and app restart — `GetSessionAnalysis` reads it
 * back. US1 uses the general benchmark; US2 injects a BenchmarkDataSource.
 */
export class AnalyzeSession {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly summonerRepo: SummonerRepository,
    private readonly analysisRepo: SessionAnalysisRepository,
    private readonly model: SessionCoachingModel,
    private readonly modelName: string,
    private readonly benchmarkSource: BenchmarkDataSource | null = null,
    private readonly goalRepo: SessionGoalRepository | null = null,
    private readonly now: () => number = () => Date.now()
  ) {}

  async execute(): Promise<SessionAnalysis> {
    const account = this.matchRepo.getCurrentAccount()
    const matches = account ? this.matchRepo.listMatches(account.puuid) : []
    const profile = account ? this.summonerRepo.getProfile(account.puuid) : null
    const lpHistory = account ? this.summonerRepo.getLpHistory(account.puuid) : []

    const tier = profile?.soloRank?.tier ?? null

    if (matches.length < MIN_GAMES) {
      return {
        insights: [],
        noData: true,
        benchmarkBasisUsed: 'general',
        generatedAt: this.now(),
        model: this.modelName
      }
    }

    // Champion/patch benchmark for the most-played pick, falling back to the
    // general per-rank benchmark when OP.GG has nothing (FR-011, SC-005).
    let benchmark = resolveGeneralBenchmark(tier)
    const top = topChampionRole(matches)
    if (top && this.benchmarkSource) {
      const champBench = await this.benchmarkSource
        .getChampionBenchmark({ champion: top.champion, role: top.role, tier })
        .catch(() => null)
      if (champBench) benchmark = champBench
    }

    const features = computeSessionFeatures({ matches, profile, lpHistory, benchmark })

    // The player's own goal/notes, passed as stated intent (not a computed fact)
    // so the coach can speak to what they're working on. Omitted when unset, so
    // a no-goal run is identical to before (FR-010, US3).
    const goal = this.goalRepo?.get() ?? null
    const playerContext: PlayerContext | undefined =
      goal && hasContent(goal) ? { goal: goal.goal, notes: goal.notes } : undefined

    const output = await this.model.analyzeSession(features, this.modelName, playerContext)

    const analysis: SessionAnalysis = {
      insights: output.insights,
      noData: output.noData,
      benchmarkBasisUsed: benchmark.basis,
      generatedAt: this.now(),
      model: this.modelName
    }

    // Persist the latest real analysis so resync/restart doesn't lose it. A
    // noData run never overwrites a previously good analysis.
    if (account && !analysis.noData) {
      this.analysisRepo.save(account.puuid, analysis)
    }

    return analysis
  }
}
