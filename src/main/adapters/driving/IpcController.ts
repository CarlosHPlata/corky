import { ipcMain } from 'electron'
import type { SyncRecentMatches } from '../../application/commands/SyncRecentMatches'
import type { GetMatchList } from '../../application/queries/GetMatchList'
import type { GetCoachReport } from '../../application/queries/GetCoachReport'

export function registerIpcHandlers(deps: {
  syncRecentMatches: SyncRecentMatches
  getMatchList: GetMatchList
  getCoachReport: GetCoachReport
}): void {
  ipcMain.handle('matches:sync', async (_event, count: number) => {
    await deps.syncRecentMatches.execute(count)
  })

  ipcMain.handle('matches:list', () => {
    return deps.getMatchList.execute()
  })

  ipcMain.handle('report:get', (_event, matchId: string) => {
    return deps.getCoachReport.execute(matchId)
  })
}
