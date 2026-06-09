import type { SessionInsight } from '@shared/types'
import type { SessionFeatures } from '../../domain/sessionFeatures'

/** What the model returns, pre-DTO. The query stamps provenance onto this. */
export interface SessionAnalysisOutput {
  insights: SessionInsight[]
  noData: boolean
}

/**
 * Driven port for the session (aggregate) coach. The implementation receives
 * pre-computed facts and only prioritizes/diagnoses/writes — it must not fetch
 * data or invent numbers (Constitution II). See
 * specs/.../contracts/session-coaching-model.port.md.
 */
export interface SessionCoachingModel {
  analyzeSession(features: SessionFeatures, model: string): Promise<SessionAnalysisOutput>
}
