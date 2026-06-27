import { getDatabase } from './database'
import { config } from './config'
import { SqliteMatchRepository } from '../adapters/driven/sqlite/SqliteMatchRepository'
import { SqliteSummonerRepository } from '../adapters/driven/sqlite/SqliteSummonerRepository'
import { SqliteReportRepository } from '../adapters/driven/sqlite/SqliteReportRepository'
import { SqliteSessionAnalysisRepository } from '../adapters/driven/sqlite/SqliteSessionAnalysisRepository'
import { SqliteSessionGoalRepository } from '../adapters/driven/sqlite/SqliteSessionGoalRepository'
import { SqliteSemanticMemory } from '../adapters/driven/sqlite/SqliteSemanticMemory'
import { SqliteChatSessionRepository } from '../adapters/driven/sqlite/SqliteChatSessionRepository'
import { SqliteReflectionRepository } from '../adapters/driven/sqlite/SqliteReflectionRepository'
import { RiotApiClient } from '../adapters/driven/riot/RiotApiClient'
import { AnthropicCoachingModel } from '../adapters/driven/anthropic/AnthropicCoachingModel'
import { AnthropicSessionCoachingModel } from '../adapters/driven/anthropic/AnthropicSessionCoachingModel'
import { AnthropicMatchCoachingModel } from '../adapters/driven/anthropic/AnthropicMatchCoachingModel'
import { OpggMcpClient } from '../adapters/driven/opgg/OpggMcpClient'
import { OpggBenchmarkDataSource } from '../adapters/driven/opgg/OpggBenchmarkDataSource'
import { OpggChampionInsightsDataSource } from '../adapters/driven/opgg/OpggChampionInsightsDataSource'
import { DDragonItemCatalog, type ItemSnapshot } from '../adapters/driven/ddragon/DDragonItemCatalog'
import bundledItemSnapshot from '../adapters/driven/ddragon/itemSnapshot.json'
import { app as electronApp } from 'electron'
import { join } from 'node:path'
import { SyncRecentMatches } from '../application/commands/SyncRecentMatches'
import { SyncSummonerProfile } from '../application/commands/SyncSummonerProfile'
import { GetMatchList } from '../application/queries/GetMatchList'
import { GetMatchPage } from '../application/queries/GetMatchPage'
import { GetSummonerProfile } from '../application/queries/GetSummonerProfile'
import { GetLpHistory } from '../application/queries/GetLpHistory'
import { GetCoachReport } from '../application/queries/GetCoachReport'
import { GetHistoryAggregates } from '../application/queries/GetHistoryAggregates'
import { GetSessionAnalysis } from '../application/queries/GetSessionAnalysis'
import { AnalyzeSession } from '../application/commands/AnalyzeSession'
import { AnalyzeMatch } from '../application/commands/AnalyzeMatch'
import { GetMatchAnalysis } from '../application/queries/GetMatchAnalysis'
import { CoachChat } from '../application/commands/CoachChat'
import { SummarizeIntoReflection } from '../application/commands/SummarizeIntoReflection'
import { DistillSessionMemory } from '../application/commands/DistillSessionMemory'
import { GetStandingTasks } from '../application/queries/GetStandingTasks'
import { GetProgress } from '../application/queries/GetProgress'
import { GetChatSessions } from '../application/queries/GetChatSessions'
import { SaveChatSession } from '../application/commands/SaveChatSession'
import { ResolveProposal } from '../application/commands/ResolveProposal'
import { SaveReflection } from '../application/commands/SaveReflection'
import { DeleteReflection } from '../application/commands/DeleteReflection'
import { ListReflections } from '../application/queries/ListReflections'
import { GetSessionGoal } from '../application/queries/GetSessionGoal'
import { SaveSessionGoal } from '../application/commands/SaveSessionGoal'
import { SqliteCoachingConfigRepository } from '../adapters/driven/sqlite/SqliteCoachingConfigRepository'
import { resolveConfig } from '../domain/config/coachingConfig'
import { GetCoachingConfig } from '../application/queries/GetCoachingConfig'
import { SaveCoachingConfig } from '../application/commands/SaveCoachingConfig'
import { RestoreCoachingConfigDefaults } from '../application/commands/RestoreCoachingConfigDefaults'
import { MatchService } from '../application/services/Match/MatchService'
import { IdentityService } from '../application/services/Identity/IdentityService'
import { LcuLeagueClientGateway } from '../adapters/driven/lcu/LcuLeagueClientGateway'
import { LockfileSource } from '../adapters/driven/lcu/lockfileSource'
import { LcuConnectionService } from '../adapters/driven/lcu/LcuConnectionService'
import { lcuPing } from '../adapters/driven/lcu/lcuHttp'
import { LcuLiveClientGateway } from '../adapters/driven/lcu/LcuLiveClientGateway'
import { LiveGameService } from '../application/services/LiveGame/LiveGameService'
import { ChampSelectService } from '../application/services/ChampSelect/ChampSelectService'
import { GetChampSelectState } from '../application/queries/GetChampSelectState'
import { ChampSelectListener } from '../adapters/driving/ChampSelectListener'
import { eventBus } from '../application/events/EventBus'
import { GetClientStatus } from '../application/queries/GetClientStatus'
import { LcuEventListener } from '../adapters/driving/LcuEventListener'
import { observed } from './observe'

export function buildContainer() {
  const db = getDatabase()

  // Observability interceptors (see infrastructure/observe.ts): every driven
  // adapter is wrapped so each call OUT (sqlite / riot-api / anthropic) emits
  // a telemetry event on the shared bus, and every use case is wrapped so each
  // call INTO the application layer does too. Wrapping happens HERE only — the
  // classes themselves never know they are observed. (The OP.GG client emits
  // its own richer events from inside, with tool names and cache hit/miss.)
  const sqlite = <T extends object>(name: string, x: T): T =>
    observed(x, { layer: 'outbound', target: 'sqlite', name })
  const ext = <T extends object>(target: string, name: string, x: T): T =>
    observed(x, { layer: 'outbound', target, name })
  const app = <T extends object>(name: string, x: T): T => observed(x, { layer: 'app', name })

  const matchRepo = sqlite('MatchRepository', new SqliteMatchRepository(db))
  const summonerRepo = sqlite('SummonerRepository', new SqliteSummonerRepository(db))
  const reportRepo = sqlite('ReportRepository', new SqliteReportRepository(db))
  const sessionAnalysisRepo = sqlite('SessionAnalysisRepository', new SqliteSessionAnalysisRepository(db))
  const sessionGoalRepo = sqlite('SessionGoalRepository', new SqliteSessionGoalRepository(db))
  const semanticMemory = sqlite('SemanticMemory', new SqliteSemanticMemory(db))
  const chatSessionRepo = sqlite('ChatSessionRepository', new SqliteChatSessionRepository(db))
  const reflectionRepo = sqlite('ReflectionRepository', new SqliteReflectionRepository(db))
  const coachingConfigRepo = sqlite('CoachingConfigRepository', new SqliteCoachingConfigRepository(db))
  const riotClient = ext('riot-api', 'RiotApiClient', new RiotApiClient(config.riotApiKey))
  const coachingModel = ext('anthropic', 'CoachingModel', new AnthropicCoachingModel(config.anthropicApiKey))
  const sessionCoachingModel = ext(
    'anthropic',
    'SessionCoachingModel',
    AnthropicSessionCoachingModel.fromApiKey(config.anthropicApiKey)
  )
  // The match coach re-reads the user's edited coaching instructions on every
  // model invocation (cheap single-row read), so Settings edits apply live.
  const matchCoachingModel = ext(
    'anthropic',
    'MatchCoachingModel',
    AnthropicMatchCoachingModel.fromApiKey(config.anthropicApiKey, () =>
      Object.fromEntries(
        resolveConfig(coachingConfigRepo.get()).prompts.map((p) => [p.id, p.instructions])
      )
    )
  )
  // Single shared OP.GG client (reusable across future features) + this feature's
  // narrow benchmark adapter over it.
  const opggClient = new OpggMcpClient()
  const benchmarkSource = new OpggBenchmarkDataSource(opggClient)
  const insightsSource = new OpggChampionInsightsDataSource(opggClient)
  // Item id → name resolver. Layered so the report ALWAYS has names: bundled
  // snapshot ships with the app (first launch / offline), a disk cache in
  // userData persists the freshest live fetch across runs, and a background
  // Data Dragon refresh keeps things current. See DDragonItemCatalog.
  const itemCatalog = ext(
    'ddragon',
    'ItemCatalog',
    new DDragonItemCatalog(
      bundledItemSnapshot as ItemSnapshot,
      join(electronApp.getPath('userData'), 'ddragon-items.json')
    )
  )

  // League client identity (spec 006) + the shared LCU connection observer
  // (spec 007). One `LcuConnectionService` is the single source of truth for
  // "is the client API up": it watches the lockfile and pings the API to
  // confirm the loopback server is actually serving (a present lockfile alone
  // doesn't mean it is). Every client-aware feature rides this one instance —
  // identity today, champ-select/live-feed next. The active player comes from
  // the live client (or the cached last-known player), resolved by
  // IdentityService; the listener pushes identity changes to the renderer.
  const lockfileSource = new LockfileSource()
  const lcuConnection = new LcuConnectionService({
    readLockfile: () => lockfileSource.read(),
    ping: (info) => lcuPing(info)
  })
  const leagueClient = new LcuLeagueClientGateway(lockfileSource, lcuConnection)
  const identityService = app(
    'IdentityService',
    new IdentityService(leagueClient, matchRepo, {
      devSeed: config.devSeed,
      accountResolver: riotClient
    })
  )
  const getClientStatus = app('GetClientStatus', new GetClientStatus(identityService))
  const lcuEventListener = new LcuEventListener(identityService)

  // Live game feed (spec 007). The LCU WAMP WebSocket rides the SAME shared
  // connection observer: it opens when the API is up and subscribes to the
  // gameflow phase + champ-select session. LiveGameService translates phase
  // transitions into domain events (ChampSelectEntered / GameStarted /
  // GameEnded) on the in-process bus, where downstream pipelines attach later.
  const liveClient = new LcuLiveClientGateway(lcuConnection)
  const liveGameService = app(
    'LiveGameService',
    new LiveGameService(liveClient, { emit: (e) => eventBus.emit(e) })
  )
  // Live champ select (spec 007): builds the roster/bans DTO from the same WS
  // feed and pushes it to the renderer; the listener also brings the window to
  // the front when champ select opens.
  const champSelectService = app('ChampSelectService', new ChampSelectService(liveClient))
  const getChampSelectState = app('GetChampSelectState', new GetChampSelectState(champSelectService))
  const champSelectListener = new ChampSelectListener(champSelectService)

  const syncRecentMatches = app('SyncRecentMatches', new SyncRecentMatches(riotClient, matchRepo))
  const syncSummonerProfile = app(
    'SyncSummonerProfile',
    new SyncSummonerProfile(riotClient, matchRepo, summonerRepo)
  )

  const getMatchList = app('GetMatchList', new GetMatchList(matchRepo))
  const getMatchPage = app('GetMatchPage', new GetMatchPage(matchRepo))
  const getSummonerProfile = app('GetSummonerProfile', new GetSummonerProfile(matchRepo, summonerRepo))
  const getLpHistory = app('GetLpHistory', new GetLpHistory(matchRepo, summonerRepo))
  const getCoachReport = app('GetCoachReport', new GetCoachReport(reportRepo))
  // Centralizes the assembleMatchReport path so every command/query that needs
  // the factual report (or the full Match bundle) reads through one service.
  const matchService = app(
    'MatchService',
    new MatchService(matchRepo, reportRepo, sessionGoalRepo, reflectionRepo, itemCatalog)
  )
  const getHistoryAggregates = app('GetHistoryAggregates', new GetHistoryAggregates(matchRepo, matchService))
  const analyzeSession = app('AnalyzeSession', new AnalyzeSession(
    matchRepo,
    summonerRepo,
    sessionAnalysisRepo,
    sessionCoachingModel,
    config.anthropicModel,
    benchmarkSource,
    sessionGoalRepo
  ))
  const analyzeMatch = app('AnalyzeMatch', new AnalyzeMatch(
    matchRepo,
    summonerRepo,
    reportRepo,
    matchService,
    matchCoachingModel,
    benchmarkSource,
    sessionGoalRepo,
    coachingConfigRepo,
    config.anthropicLightModel,
    config.anthropicHeavyModel
  ))
  const getMatchAnalysis = app('GetMatchAnalysis', new GetMatchAnalysis(reportRepo))
  // Post-game coaching chat runs entirely on the LIGHT tier — both the per-turn
  // replies AND the finalize step (write the reflection + lightly adjust focus
  // tasks). The chat is conversational and frequent, so it must stay cheap/fast;
  // never put it on the heavy model. (The heavy tier is reserved for the one-shot
  // match analysis passes, not the chat.)
  const coachChat = app('CoachChat', new CoachChat(
    matchService,
    semanticMemory,
    getHistoryAggregates,
    benchmarkSource,
    insightsSource,
    coachingConfigRepo,
    matchCoachingModel,
    config.anthropicLightModel
  ))
  // Memory distillation rides coach-reflection acceptance (spec 005 US5):
  // fire-and-forget from ResolveProposal's hook — never blocks an accept.
  const distillSessionMemory = app('DistillSessionMemory', new DistillSessionMemory(
    matchRepo,
    chatSessionRepo,
    semanticMemory,
    matchService,
    matchCoachingModel,
    config.anthropicLightModel
  ))
  // The ONLY write path for model-initiated changes (spec 005): accept applies,
  // reject discards, staleness re-checked at accept time.
  const resolveProposal = app('ResolveProposal', new ResolveProposal(
    matchRepo,
    reportRepo,
    chatSessionRepo,
    reflectionRepo,
    undefined,
    (matchId, sessionId) => {
      void distillSessionMemory
        .execute(matchId, sessionId)
        .catch((err) => console.error('memory distillation failed:', err))
    }
  ))
  const saveReflection = app('SaveReflection', new SaveReflection(matchRepo, reportRepo, reflectionRepo, matchService))
  const deleteReflection = app('DeleteReflection', new DeleteReflection(reflectionRepo))
  const listReflections = app('ListReflections', new ListReflections(reflectionRepo))
  const summarizeIntoReflection = app('SummarizeIntoReflection', new SummarizeIntoReflection(
    matchRepo,
    reflectionRepo,
    matchService,
    matchCoachingModel,
    config.anthropicLightModel
  ))
  const getStandingTasks = app('GetStandingTasks', new GetStandingTasks(matchRepo, reportRepo))
  const getProgress = app('GetProgress', new GetProgress(matchRepo, reportRepo, semanticMemory))
  const getChatSessions = app('GetChatSessions', new GetChatSessions(chatSessionRepo))
  const saveChatSession = app('SaveChatSession', new SaveChatSession(chatSessionRepo))
  const getSessionAnalysis = app('GetSessionAnalysis', new GetSessionAnalysis(matchRepo, sessionAnalysisRepo))
  const getSessionGoal = app('GetSessionGoal', new GetSessionGoal(sessionGoalRepo))
  const saveSessionGoal = app('SaveSessionGoal', new SaveSessionGoal(sessionGoalRepo))
  const getCoachingConfig = app('GetCoachingConfig', new GetCoachingConfig(coachingConfigRepo))
  const saveCoachingConfig = app('SaveCoachingConfig', new SaveCoachingConfig(coachingConfigRepo))
  const restoreCoachingConfigDefaults = app(
    'RestoreCoachingConfigDefaults',
    new RestoreCoachingConfigDefaults(coachingConfigRepo)
  )

  return {
    matchRepo,
    summonerRepo,
    reportRepo,
    sessionAnalysisRepo,
    sessionGoalRepo,
    semanticMemory,
    coachingModel,
    sessionCoachingModel,
    opggClient,
    benchmarkSource,
    syncRecentMatches,
    syncSummonerProfile,
    getMatchList,
    getMatchPage,
    matchService,
    identityService,
    getClientStatus,
    leagueClient,
    lcuConnection,
    liveClient,
    liveGameService,
    champSelectService,
    getChampSelectState,
    champSelectListener,
    lcuEventListener,
    getSummonerProfile,
    getLpHistory,
    getCoachReport,
    getHistoryAggregates,
    analyzeMatch,
    getMatchAnalysis,
    coachChat,
    summarizeIntoReflection,
    distillSessionMemory,
    getStandingTasks,
    getProgress,
    chatSessionRepo,
    reflectionRepo,
    getChatSessions,
    saveChatSession,
    resolveProposal,
    saveReflection,
    deleteReflection,
    listReflections,
    analyzeSession,
    getSessionAnalysis,
    getSessionGoal,
    saveSessionGoal,
    coachingConfigRepo,
    getCoachingConfig,
    saveCoachingConfig,
    restoreCoachingConfigDefaults
  }
}
