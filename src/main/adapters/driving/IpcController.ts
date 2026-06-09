import { ipcMain } from 'electron'
import type { SyncRecentMatches } from '../../application/commands/SyncRecentMatches'
import type { SyncSummonerProfile } from '../../application/commands/SyncSummonerProfile'
import type { GetMatchList } from '../../application/queries/GetMatchList'
import type { GetSummonerProfile } from '../../application/queries/GetSummonerProfile'
import type { GetLpHistory } from '../../application/queries/GetLpHistory'
import type { GetCoachReport } from '../../application/queries/GetCoachReport'
import type { GetSessionAnalysis } from '../../application/queries/GetSessionAnalysis'
import type { AnalyzeSession } from '../../application/commands/AnalyzeSession'

export function registerIpcHandlers(deps: {
  syncRecentMatches: SyncRecentMatches
  syncSummonerProfile: SyncSummonerProfile
  getMatchList: GetMatchList
  getSummonerProfile: GetSummonerProfile
  getLpHistory: GetLpHistory
  getCoachReport: GetCoachReport
  getSessionAnalysis: GetSessionAnalysis
  analyzeSession: AnalyzeSession
}): void {
  ipcMain.handle('matches:sync', async (_event, count: number) => {
    await deps.syncRecentMatches.execute(count)
  })

  ipcMain.handle('matches:list', () => {
    return deps.getMatchList.execute()
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
}
