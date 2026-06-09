import type { SessionInsight } from '@shared/types'
import type { SessionFeatures } from '../../domain/sessionFeatures'

/** What the model returns, pre-DTO. The query stamps provenance onto this. */
export interface SessionAnalysisOutput {
  insights: SessionInsight[]
  noData: boolean
}

/**
 * The player's own stated goal + notes — intent, NOT a computed fact. Passed
 * alongside the features so the coach can speak to what the player is working
 * on; the model must never cite it as evidence (Constitution II).
 */
export interface PlayerContext {
  goal: string
  notes: string
}

/**
 * Driven port for the session (aggregate) coach. The implementation receives
 * pre-computed facts and only prioritizes/diagnoses/writes — it must not fetch
 * data or invent numbers (Constitution II). See
 * specs/.../contracts/session-coaching-model.port.md.
 */
export interface SessionCoachingModel {
  analyzeSession(
    features: SessionFeatures,
    model: string,
    playerContext?: PlayerContext
  ): Promise<SessionAnalysisOutput>
}
