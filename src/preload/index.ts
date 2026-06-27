import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcApi, MatchSummary, MatchPage, MatchPageRequest, MatchReport,
  SummonerProfile, LpSnapshot, CoachReport, SessionAnalysis,
  SessionGoal, SessionGoalInput, MatchAnalysis, AnalyzeMatchOptions,
  ChatTurn, CoachChatReply, StandingFocusTask, ProgressSummary,
  ChatSession, ChatSessionMeta, ResolveProposalInput, ResolveProposalOutcome,
  Reflection, SaveReflectionInput, ClientStatus, ChampSelectState
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
  coachChat: (matchId: string, sessionId: string, messages: ChatTurn[]): Promise<CoachChatReply> =>
    ipcRenderer.invoke('coach:chat', matchId, sessionId, messages),
  resolveProposal: (input: ResolveProposalInput): Promise<ResolveProposalOutcome> =>
    ipcRenderer.invoke('proposal:resolve', input),
  listReflections: (matchId: string): Promise<Reflection[]> =>
    ipcRenderer.invoke('reflections:list', matchId),
  saveReflection: (input: SaveReflectionInput): Promise<Reflection> =>
    ipcRenderer.invoke('reflections:save', input),
  deleteReflection: (matchId: string, reflectionId: string): Promise<void> =>
    ipcRenderer.invoke('reflections:delete', matchId, reflectionId),
  summarizeIntoReflection: (matchId: string, sessionId: string, messages: ChatTurn[]): Promise<CoachChatReply> =>
    ipcRenderer.invoke('coach:summarize', matchId, sessionId, messages),
  getStandingTasks: (): Promise<StandingFocusTask[]> => ipcRenderer.invoke('tasks:standing:get'),
  getProgress: (): Promise<ProgressSummary> => ipcRenderer.invoke('progress:get'),
  listChatSessions: (matchId: string): Promise<ChatSessionMeta[]> =>
    ipcRenderer.invoke('chat:sessions:list', matchId),
  getChatSession: (sessionId: string): Promise<ChatSession | null> =>
    ipcRenderer.invoke('chat:sessions:get', sessionId),
  saveChatSession: (matchId: string, sessionId: string, turns: ChatTurn[]): Promise<ChatSessionMeta> =>
    ipcRenderer.invoke('chat:sessions:save', matchId, sessionId, turns),
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
    ipcRenderer.invoke('config:coaching:restore'),
  getClientStatus: (): Promise<ClientStatus> => ipcRenderer.invoke('identity:status'),
  onIdentityChanged: (cb: (status: ClientStatus) => void): (() => void) => {
    const handler = (_e: unknown, status: ClientStatus): void => cb(status)
    ipcRenderer.on('identity:changed', handler)
    return () => {
      ipcRenderer.removeListener('identity:changed', handler)
    }
  },
  getChampSelectState: (): Promise<ChampSelectState | null> =>
    ipcRenderer.invoke('champSelect:state'),
  onChampSelectChanged: (cb: (state: ChampSelectState) => void): (() => void) => {
    const handler = (_e: unknown, state: ChampSelectState): void => cb(state)
    ipcRenderer.on('champSelect:changed', handler)
    return () => {
      ipcRenderer.removeListener('champSelect:changed', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
