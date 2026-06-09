import type { SessionAnalysis } from '@shared/types'

/**
 * Stores the latest Quick Analysis per account so it persists across resync and
 * app restarts (only the most recent is kept — upsert by puuid).
 */
export interface SessionAnalysisRepository {
  save(puuid: string, analysis: SessionAnalysis): void
  getLatest(puuid: string): SessionAnalysis | null
}
