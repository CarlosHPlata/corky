import type { MatchFeatures } from '../../domain/MatchFeatures'
import type { FocusTask } from '@shared/types'

export interface CoachingOutput {
  verdict: string
  focusTasks: Omit<FocusTask, 'id' | 'matchId'>[]
  turningPoints: TurningPoint[]
  rawContent: string
}

export interface TurningPoint {
  timestamp: number
  description: string
  betterPlay: string
  evidenceRef: string
}

export interface CoachingModel {
  analyze(features: MatchFeatures, model: string): Promise<CoachingOutput>
}
