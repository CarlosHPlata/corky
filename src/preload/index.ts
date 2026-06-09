import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcApi, MatchSummary, SummonerProfile, LpSnapshot, CoachReport, SessionAnalysis
} from '../shared/types'

const api: IpcApi = {
  syncMatches: (count: number) => ipcRenderer.invoke('matches:sync', count),
  getMatchList: (): Promise<MatchSummary[]> => ipcRenderer.invoke('matches:list'),
  syncProfile: () => ipcRenderer.invoke('summoner:sync'),
  getSummonerProfile: (): Promise<SummonerProfile | null> => ipcRenderer.invoke('summoner:get'),
  getLpHistory: (): Promise<LpSnapshot[]> => ipcRenderer.invoke('summoner:lp-history'),
  analyzeMatch: (matchId: string) => ipcRenderer.invoke('match:analyze', matchId),
  getCoachReport: (matchId: string): Promise<CoachReport | null> =>
    ipcRenderer.invoke('report:get', matchId),
  runSessionAnalysis: (): Promise<SessionAnalysis> => ipcRenderer.invoke('analysis:session:run'),
  getSessionAnalysis: (): Promise<SessionAnalysis | null> => ipcRenderer.invoke('analysis:session:get')
}

contextBridge.exposeInMainWorld('api', api)
