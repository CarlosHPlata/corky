export interface Account {
  puuid: string
  gameName: string
  tagLine: string
  platform: string
  region: string
}

export interface MatchSummary {
  matchId: string
  puuid: string
  queue: number
  champion: string
  role: string
  win: boolean
  kills: number
  deaths: number
  assists: number
  cs: number
  csPerMin: number
  gold: number
  goldPerMin: number
  gameCreation: number
  gameDuration: number
}

export interface MatchDetail {
  matchId: string
  rawJson: string
}

export interface Timeline {
  matchId: string
  rawJson: string
}

export interface RankInfo {
  queueType: string
  tier: string
  division: string
  leaguePoints: number
  wins: number
  losses: number
}

export interface SummonerProfile {
  puuid: string
  gameName: string
  tagLine: string
  platform: string
  region: string
  profileIconId: number
  summonerLevel: number
  soloRank: RankInfo | null
}

export interface LpSnapshot {
  ts: number
  tier: string
  division: string
  leaguePoints: number
}

export interface CoachReport {
  id: number
  matchId: string
  createdAt: number
  model: string
  content: string
}

export interface FocusTask {
  id: string
  matchId: string
  description: string
  metric: string
  comparator: '>=' | '<=' | '==' | '>' | '<'
  target: number
  scope: 'champion' | 'role' | 'universal'
  champion?: string
  role?: string
}

export type TaskEvaluationResult = 'improved' | 'held' | 'regressed' | 'not_applicable'

export interface TaskEvaluation {
  taskId: string
  evaluatingMatchId: string
  result: TaskEvaluationResult
  actualValue: number | null
}

/** Category of flaw a Quick Analysis insight diagnoses — drives the renderer icon/tone. */
export type InsightLeak =
  | 'deaths'
  | 'farming'
  | 'lead_conversion'
  | 'champion_pool'
  | 'consistency'
  | 'tempo'

/** What reference a cited benchmark was measured against (honest about its basis). */
export type BenchmarkBasis = 'champion_patch' | 'rank_general' | 'general'

/** One unit of session coaching — maps onto a Quick Analysis insight row. */
export interface SessionInsight {
  leak: InsightLeak
  /** The flaw, blunt and short. */
  headline: string
  /** Why it costs LP at this rank + the concrete next-game action. */
  body: string
  /** Chip text drawn from computed signals, e.g. "avgKDA 3.1 · 38% WR". */
  evidence: string
  /** Reference basis when a benchmark is cited; null when none applies. */
  benchmarkBasis: BenchmarkBasis | null
  /** `provisional` when the pattern rests on fewer than 3 games. */
  confidence: 'established' | 'provisional'
}

/** The full Quick Analysis result returned to the renderer (ephemeral, session-cached). */
export interface SessionAnalysis {
  /** 0–4 insights, target 2–3, impact-ordered. Empty when `noData`. */
  insights: SessionInsight[]
  /** true when there are too few games to analyze → renderer shows "needs games". */
  noData: boolean
  /** Overall benchmark basis actually used for this run (transparency). */
  benchmarkBasisUsed: BenchmarkBasis
  /** epoch ms, stamped in the main process. */
  generatedAt: number
  /** model id used (provenance). */
  model: string
}

export interface IpcApi {
  syncMatches: (count: number) => Promise<void>
  getMatchList: () => Promise<MatchSummary[]>
  syncProfile: () => Promise<void>
  getSummonerProfile: () => Promise<SummonerProfile | null>
  getLpHistory: () => Promise<LpSnapshot[]>
  analyzeMatch: (matchId: string) => Promise<void>
  getCoachReport: (matchId: string) => Promise<CoachReport | null>
  /** Generate a fresh analysis and persist it as the account's latest. */
  runSessionAnalysis: () => Promise<SessionAnalysis>
  /** The last persisted analysis for the current account, or null if none yet. */
  getSessionAnalysis: () => Promise<SessionAnalysis | null>
}
