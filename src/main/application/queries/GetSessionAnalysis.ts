import type { SessionAnalysis } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'
import type { SessionAnalysisRepository } from '../ports/SessionAnalysisRepository'

/**
 * Reads the last persisted Quick Analysis for the current account (or null if
 * none has been run yet). Read-only — the renderer calls this on load so a
 * previously generated analysis is restored after resync or app restart.
 * Generation + persistence lives in the `AnalyzeSession` command.
 */
export class GetSessionAnalysis {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly analysisRepo: SessionAnalysisRepository
  ) {}

  execute(): SessionAnalysis | null {
    const account = this.matchRepo.getCurrentAccount()
    if (!account) return null
    return this.analysisRepo.getLatest(account.puuid)
  }
}
