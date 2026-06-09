import { ipcMain } from 'electron'
import type { SyncRecentMatches } from '../../application/commands/SyncRecentMatches'
import type { SyncSummonerProfile } from '../../application/commands/SyncSummonerProfile'
import type { GetMatchList } from '../../application/queries/GetMatchList'
import type { GetMatchPage } from '../../application/queries/GetMatchPage'
import type { GetMatchReport } from '../../application/queries/GetMatchReport'
import type { MatchPageRequest } from '@shared/types'
import type { GetSummonerProfile } from '../../application/queries/GetSummonerProfile'
import type { GetLpHistory } from '../../application/queries/GetLpHistory'
import type { GetCoachReport } from '../../application/queries/GetCoachReport'
import type { GetSessionAnalysis } from '../../application/queries/GetSessionAnalysis'
import type { AnalyzeSession } from '../../application/commands/AnalyzeSession'
import type { GetSessionGoal } from '../../application/queries/GetSessionGoal'
import type { SaveSessionGoal } from '../../application/commands/SaveSessionGoal'
import type { SessionGoalInput } from '@shared/types'

export function registerIpcHandlers(deps: {
  syncRecentMatches: SyncRecentMatches
  syncSummonerProfile: SyncSummonerProfile
  getMatchList: GetMatchList
  getMatchPage: GetMatchPage
  getMatchReport: GetMatchReport
  getSummonerProfile: GetSummonerProfile
  getLpHistory: GetLpHistory
  getCoachReport: GetCoachReport
  getSessionAnalysis: GetSessionAnalysis
  analyzeSession: AnalyzeSession
  getSessionGoal: GetSessionGoal
  saveSessionGoal: SaveSessionGoal
}): void {
  ipcMain.handle('matches:sync', async (_event, count: number, start?: number) => {
    await deps.syncRecentMatches.execute(count, start)
  })

  ipcMain.handle('matches:list', () => {
    return deps.getMatchList.execute()
  })

  ipcMain.handle('matches:page', (_event, req: MatchPageRequest) => {
    return deps.getMatchPage.execute(req)
  })

  ipcMain.handle('report:match', (_event, matchId: string) => {
    return deps.getMatchReport.execute(matchId)
  })

  ipcMain.handle('summoner:sync', async () => {
    await deps.syncSummonerProfile.execute()
  })

  ipcMain.handle('summoner:get', () => {
    return deps.getSummonerProfile.execute()
  })

  ipcMain.handle('summoner:lp-history', () => {
    return deps.getLpHistory.execute()
  })

  ipcMain.handle('report:get', (_event, matchId: string) => {
    return deps.getCoachReport.execute(matchId)
  })

  ipcMain.handle('analysis:session:get', () => {
    return deps.getSessionAnalysis.execute()
  })

  ipcMain.handle('analysis:session:run', () => {
    return deps.analyzeSession.execute()
  })

  ipcMain.handle('goal:get', () => {
    return deps.getSessionGoal.execute()
  })

  ipcMain.handle('goal:save', (_event, input: SessionGoalInput) => {
    return deps.saveSessionGoal.execute(input)
  })
}
