import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcApi, MatchSummary, MatchPage, MatchPageRequest, MatchReport,
  SummonerProfile, LpSnapshot, CoachReport, SessionAnalysis,
  SessionGoal, SessionGoalInput
} from '../shared/types'

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
  analyzeMatch: (matchId: string) => ipcRenderer.invoke('match:analyze', matchId),
  getCoachReport: (matchId: string): Promise<CoachReport | null> =>
    ipcRenderer.invoke('report:get', matchId),
  runSessionAnalysis: (): Promise<SessionAnalysis> => ipcRenderer.invoke('analysis:session:run'),
  getSessionAnalysis: (): Promise<SessionAnalysis | null> => ipcRenderer.invoke('analysis:session:get'),
  getSessionGoal: (): Promise<SessionGoal | null> => ipcRenderer.invoke('goal:get'),
  saveSessionGoal: (input: SessionGoalInput): Promise<SessionGoal> =>
    ipcRenderer.invoke('goal:save', input)
}

contextBridge.exposeInMainWorld('api', api)
