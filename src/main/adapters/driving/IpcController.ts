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
import type { AnalyzeMatch } from '../../application/commands/AnalyzeMatch'
import type { GetMatchAnalysis } from '../../application/queries/GetMatchAnalysis'
import type { CoachChat } from '../../application/commands/CoachChat'
import type { FinalizeReflection } from '../../application/commands/FinalizeReflection'
import type { GetStandingTasks } from '../../application/queries/GetStandingTasks'
import type { AnalyzeMatchOptions, ChatTurn } from '@shared/types'
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
  analyzeMatch: AnalyzeMatch
  getMatchAnalysis: GetMatchAnalysis
  coachChat: CoachChat
  finalizeReflection: FinalizeReflection
  getStandingTasks: GetStandingTasks
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

  ipcMain.handle('analysis:match:run', (_event, matchId: string, opts?: AnalyzeMatchOptions) => {
    return deps.analyzeMatch.execute(matchId, opts)
  })

  ipcMain.handle('analysis:match:get', (_event, matchId: string) => {
    return deps.getMatchAnalysis.execute(matchId)
  })

  ipcMain.handle('coach:chat', (_event, matchId: string, messages: ChatTurn[]) => {
    return deps.coachChat.execute(matchId, messages)
  })

  ipcMain.handle('coach:reflection:finalize', (_event, matchId: string, messages: ChatTurn[]) => {
    return deps.finalizeReflection.execute(matchId, messages)
  })

  ipcMain.handle('tasks:standing:get', () => {
    return deps.getStandingTasks.execute()
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
