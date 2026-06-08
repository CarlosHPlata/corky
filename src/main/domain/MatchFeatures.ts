export interface GoldXpFrame {
  timestamp: number
  goldDiff: number
  xpDiff: number
}

export type DeathLabel = 'caught_out' | 'overextended' | 'fair_fight' | 'outnumbered'

export interface DeathContext {
  timestamp: number
  position: { x: number; y: number }
  goldStateAtFrame: number
  label: DeathLabel
  evidenceRef: string
}

export interface ObjectiveEvent {
  timestamp: number
  type: 'dragon' | 'baron' | 'herald' | 'elder' | 'tower'
  team: number
  playerPresent: boolean
  playerPosition: { x: number; y: number }
}

export interface VisionFootprint {
  wardsPlaced: number
  wardsKilled: number
}

export interface MatchFeatures {
  matchId: string
  puuid: string
  champion: string
  role: string
  win: boolean

  goldXpFrames: GoldXpFrame[]

  csAt10: number
  csAt15: number
  csAt20: number
  csRoleBenchmark: number

  deaths: DeathContext[]
  objectiveEvents: ObjectiveEvent[]
  vision: VisionFootprint

  leadConversionFailed: boolean
  teamGoldDiffAt20: number
}
