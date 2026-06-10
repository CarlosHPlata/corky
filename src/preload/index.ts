import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcApi, MatchSummary, MatchPage, MatchPageRequest, MatchReport,
  SummonerProfile, LpSnapshot, CoachReport, SessionAnalysis,
  SessionGoal, SessionGoalInput, MatchAnalysis, AnalyzeMatchOptions,
  ChatTurn, CoachChatReply, ReflectionOutcome, StandingFocusTask, ProgressSummary,
  ChatSession, ChatSessionMeta
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
  getProgress: (): Promise<ProgressSummary> => ipcRenderer.invoke('progress:get'),
  getChatTranscript: (matchId: string): Promise<{ turns: ChatTurn[]; reflection: string | null } | null> =>
    ipcRenderer.invoke('chat:transcript:get', matchId),
  saveChatTranscript: (matchId: string, turns: ChatTurn[]): Promise<void> =>
    ipcRenderer.invoke('chat:transcript:save', matchId, turns),
  saveChatReflection: (matchId: string, reflection: string): Promise<void> =>
    ipcRenderer.invoke('chat:reflection:save', matchId, reflection),
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
    ipcRenderer.invoke('config:coaching:restore')
}

contextBridge.exposeInMainWorld('api', api)
