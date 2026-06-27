import { ipcMain } from 'electron'
import type { SyncRecentMatches } from '../../application/commands/SyncRecentMatches'
import type { SyncSummonerProfile } from '../../application/commands/SyncSummonerProfile'
import type { GetMatchList } from '../../application/queries/GetMatchList'
import type { GetMatchPage } from '../../application/queries/GetMatchPage'
import type { MatchService } from '../../application/services/Match/MatchService'
import type { MatchPageRequest } from '@shared/types'
import type { GetSummonerProfile } from '../../application/queries/GetSummonerProfile'
import type { GetLpHistory } from '../../application/queries/GetLpHistory'
import type { GetCoachReport } from '../../application/queries/GetCoachReport'
import type { AnalyzeMatch } from '../../application/commands/AnalyzeMatch'
import type { GetMatchAnalysis } from '../../application/queries/GetMatchAnalysis'
import type { CoachChat } from '../../application/commands/CoachChat'
import type { SummarizeIntoReflection } from '../../application/commands/SummarizeIntoReflection'
import type { GetStandingTasks } from '../../application/queries/GetStandingTasks'
import type { GetProgress } from '../../application/queries/GetProgress'
import type { GetChatSessions } from '../../application/queries/GetChatSessions'
import type { SaveChatSession } from '../../application/commands/SaveChatSession'
import type { ResolveProposal } from '../../application/commands/ResolveProposal'
import type { SaveReflection } from '../../application/commands/SaveReflection'
import type { DeleteReflection } from '../../application/commands/DeleteReflection'
import type { ListReflections } from '../../application/queries/ListReflections'
import type { ResolveProposalInput, SaveReflectionInput } from '@shared/types'
import type { AnalyzeMatchOptions, ChatTurn } from '@shared/types'
import type { GetSessionAnalysis } from '../../application/queries/GetSessionAnalysis'
import type { GetClientStatus } from '../../application/queries/GetClientStatus'
import type { GetChampSelectState } from '../../application/queries/GetChampSelectState'
import type { AnalyzeSession } from '../../application/commands/AnalyzeSession'
import type { GetSessionGoal } from '../../application/queries/GetSessionGoal'
import type { SaveSessionGoal } from '../../application/commands/SaveSessionGoal'
import type { SessionGoalInput } from '@shared/types'
import type { GetCoachingConfig } from '../../application/queries/GetCoachingConfig'
import type { SaveCoachingConfig } from '../../application/commands/SaveCoachingConfig'
import type { RestoreCoachingConfigDefaults } from '../../application/commands/RestoreCoachingConfigDefaults'
import type { SaveCoachingConfigInput } from '@shared/config'

export function registerIpcHandlers(deps: {
  syncRecentMatches: SyncRecentMatches
  syncSummonerProfile: SyncSummonerProfile
  getMatchList: GetMatchList
  getMatchPage: GetMatchPage
  matchService: MatchService
  getSummonerProfile: GetSummonerProfile
  getLpHistory: GetLpHistory
  getCoachReport: GetCoachReport
  analyzeMatch: AnalyzeMatch
  getMatchAnalysis: GetMatchAnalysis
  coachChat: CoachChat
  summarizeIntoReflection: SummarizeIntoReflection
  getStandingTasks: GetStandingTasks
  getProgress: GetProgress
  getChatSessions: GetChatSessions
  saveChatSession: SaveChatSession
  resolveProposal: ResolveProposal
  saveReflection: SaveReflection
  deleteReflection: DeleteReflection
  listReflections: ListReflections
  getSessionAnalysis: GetSessionAnalysis
  getClientStatus: GetClientStatus
  getChampSelectState: GetChampSelectState
  analyzeSession: AnalyzeSession
  getSessionGoal: GetSessionGoal
  saveSessionGoal: SaveSessionGoal
  getCoachingConfig: GetCoachingConfig
  saveCoachingConfig: SaveCoachingConfig
  restoreCoachingConfigDefaults: RestoreCoachingConfigDefaults
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
    return deps.matchService.getReport(matchId)
  })

  ipcMain.handle('summoner:sync', async () => {
    await deps.syncSummonerProfile.execute()
  })

  ipcMain.handle('summoner:get', () => {
    return deps.getSummonerProfile.execute()
  })

  // League client identity (spec 006). The live `identity:changed` push is sent
  // directly to the renderer by LcuEventListener; this is the on-demand read.
  ipcMain.handle('identity:status', () => {
    return deps.getClientStatus.execute()
  })

  // Live champ select (spec 007). Live updates are pushed via `champSelect:changed`
  // by ChampSelectListener; this is the on-demand read for first paint.
  ipcMain.handle('champSelect:state', () => {
    return deps.getChampSelectState.execute()
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

  ipcMain.handle('coach:chat', (_event, matchId: string, sessionId: string, messages: ChatTurn[]) => {
    return deps.coachChat.execute(matchId, sessionId, messages)
  })

  ipcMain.handle('proposal:resolve', (_event, input: ResolveProposalInput) => {
    return deps.resolveProposal.execute(input)
  })

  ipcMain.handle('reflections:list', (_event, matchId: string) => {
    return deps.listReflections.execute(matchId)
  })

  ipcMain.handle('reflections:save', (_event, input: SaveReflectionInput) => {
    return deps.saveReflection.execute(input)
  })

  ipcMain.handle('reflections:delete', (_event, matchId: string, reflectionId: string) => {
    deps.deleteReflection.execute(matchId, reflectionId)
  })

  ipcMain.handle(
    'coach:summarize',
    (_event, matchId: string, sessionId: string, messages: ChatTurn[]) => {
      return deps.summarizeIntoReflection.execute(matchId, sessionId, messages)
    }
  )

  ipcMain.handle('tasks:standing:get', () => {
    return deps.getStandingTasks.execute()
  })

  ipcMain.handle('progress:get', () => {
    return deps.getProgress.execute()
  })

  ipcMain.handle('chat:sessions:list', (_event, matchId: string) => {
    return deps.getChatSessions.listMetas(matchId)
  })

  ipcMain.handle('chat:sessions:get', (_event, sessionId: string) => {
    return deps.getChatSessions.get(sessionId)
  })

  ipcMain.handle(
    'chat:sessions:save',
    (_event, matchId: string, sessionId: string, turns: ChatTurn[]) => {
      return deps.saveChatSession.execute(matchId, sessionId, turns)
    }
  )

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

  ipcMain.handle('config:coaching:get', () => {
    return deps.getCoachingConfig.execute()
  })

  ipcMain.handle('config:coaching:save', (_event, input: SaveCoachingConfigInput) => {
    return deps.saveCoachingConfig.execute(input)
  })

  ipcMain.handle('config:coaching:restore', () => {
    return deps.restoreCoachingConfigDefaults.execute()
  })
}
