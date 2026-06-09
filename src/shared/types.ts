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

export interface IpcApi {
  syncMatches: (count: number) => Promise<void>
  getMatchList: () => Promise<MatchSummary[]>
  syncProfile: () => Promise<void>
  getSummonerProfile: () => Promise<SummonerProfile | null>
  getLpHistory: () => Promise<LpSnapshot[]>
  analyzeMatch: (matchId: string) => Promise<void>
  getCoachReport: (matchId: string) => Promise<CoachReport | null>
}
