import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcApi, MatchSummary, MatchPage, MatchPageRequest, MatchReport,
  SummonerProfile, LpSnapshot, CoachReport, SessionAnalysis,
  SessionGoal, SessionGoalInput, MatchAnalysis, AnalyzeMatchOptions,
  ChatTurn, CoachChatReply, ReflectionOutcome, StandingFocusTask
} from '../shared/types'
import type { ResolvedCoachingConfig, SaveCoachingConfigInput } from '../shared/config'

const api: IpcApi = {
  syncMatches: (count: number, start?: number) => ipcRenderer.invoke('matches:sync', count, start),
  getMatchList: (): Promise<MatchSummary[]> => ipcRenderer.invoke('matches:list'),
  getMatchPage: (req: MatchPageRequest): Promise<MatchPage> =>
    ipcRenderer.invoke('matches:page', req),
  getMatchReport: (matchId: string): Promise<MatchReport | null> =>
    ipcRenderer.invoke('report:match', matchId),
  syncProfile: () => ipcRenderer.invoke('summoner:sync'),
  getSummonerProfile: (): Promise<SummonerProfile | null> => ipcRenderer.invoke('summoner:get'),
  getLpHistory: (): Promise<LpSnapshot[]> => ipcRenderer.invoke('summoner:lp-history'),
  analyzeMatch: (matchId: string, opts?: AnalyzeMatchOptions): Promise<MatchAnalysis> =>
    ipcRenderer.invoke('analysis:match:run', matchId, opts),
  getMatchAnalysis: (matchId: string): Promise<MatchAnalysis | null> =>
    ipcRenderer.invoke('analysis:match:get', matchId),
  coachChat: (matchId: string, messages: ChatTurn[]): Promise<CoachChatReply> =>
    ipcRenderer.invoke('coach:chat', matchId, messages),
  finalizeReflection: (matchId: string, messages: ChatTurn[]): Promise<ReflectionOutcome> =>
    ipcRenderer.invoke('coach:reflection:finalize', matchId, messages),
  getStandingTasks: (): Promise<StandingFocusTask[]> => ipcRenderer.invoke('tasks:standing:get'),
  getCoachReport: (matchId: string): Promise<CoachReport | null> =>
    ipcRenderer.invoke('report:get', matchId),
  runSessionAnalysis: (): Promise<SessionAnalysis> => ipcRenderer.invoke('analysis:session:run'),
  getSessionAnalysis: (): Promise<SessionAnalysis | null> => ipcRenderer.invoke('analysis:session:get'),
  getSessionGoal: (): Promise<SessionGoal | null> => ipcRenderer.invoke('goal:get'),
  saveSessionGoal: (input: SessionGoalInput): Promise<SessionGoal> =>
    ipcRenderer.invoke('goal:save', input),
  getCoachingConfig: (): Promise<ResolvedCoachingConfig> => ipcRenderer.invoke('config:coaching:get'),
  saveCoachingConfig: (input: SaveCoachingConfigInput): Promise<ResolvedCoachingConfig> =>
    ipcRenderer.invoke('config:coaching:save', input),
  restoreCoachingConfigDefaults: (): Promise<ResolvedCoachingConfig> =>
    ipcRenderer.invoke('config:coaching:restore')
}

contextBridge.exposeInMainWorld('api', api)
