import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi, MatchSummary, CoachReport } from '../shared/types'

const api: IpcApi = {
  syncMatches: (count: number) => ipcRenderer.invoke('matches:sync', count),
  getMatchList: (): Promise<MatchSummary[]> => ipcRenderer.invoke('matches:list'),
  analyzeMatch: (matchId: string) => ipcRenderer.invoke('match:analyze', matchId),
  getCoachReport: (matchId: string): Promise<CoachReport | null> =>
    ipcRenderer.invoke('report:get', matchId)
}

contextBridge.exposeInMainWorld('api', api)
