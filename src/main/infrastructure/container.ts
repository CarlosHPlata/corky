import { getDatabase } from './database'
import { config } from './config'
import { SqliteMatchRepository } from '../adapters/driven/sqlite/SqliteMatchRepository'
import { SqliteSummonerRepository } from '../adapters/driven/sqlite/SqliteSummonerRepository'
import { SqliteReportRepository } from '../adapters/driven/sqlite/SqliteReportRepository'
import { SqliteSessionAnalysisRepository } from '../adapters/driven/sqlite/SqliteSessionAnalysisRepository'
import { SqliteSessionGoalRepository } from '../adapters/driven/sqlite/SqliteSessionGoalRepository'
import { SqliteSemanticMemory } from '../adapters/driven/sqlite/SqliteSemanticMemory'
import { SqliteChatTranscriptRepository } from '../adapters/driven/sqlite/SqliteChatTranscriptRepository'
import { SqliteChatSessionRepository } from '../adapters/driven/sqlite/SqliteChatSessionRepository'
import { SqliteReflectionRepository } from '../adapters/driven/sqlite/SqliteReflectionRepository'
import { RiotApiClient } from '../adapters/driven/riot/RiotApiClient'
import { AnthropicCoachingModel } from '../adapters/driven/anthropic/AnthropicCoachingModel'
import { AnthropicSessionCoachingModel } from '../adapters/driven/anthropic/AnthropicSessionCoachingModel'
import { AnthropicMatchCoachingModel } from '../adapters/driven/anthropic/AnthropicMatchCoachingModel'
import { OpggMcpClient } from '../adapters/driven/opgg/OpggMcpClient'
import { OpggBenchmarkDataSource } from '../adapters/driven/opgg/OpggBenchmarkDataSource'
import { SyncRecentMatches } from '../application/commands/SyncRecentMatches'
import { SyncSummonerProfile } from '../application/commands/SyncSummonerProfile'
import { GetMatchList } from '../application/queries/GetMatchList'
import { GetMatchPage } from '../application/queries/GetMatchPage'
import { GetMatchReport } from '../application/queries/GetMatchReport'
import { GetSummonerProfile } from '../application/queries/GetSummonerProfile'
import { GetLpHistory } from '../application/queries/GetLpHistory'
import { GetCoachReport } from '../application/queries/GetCoachReport'
import { GetHistoryAggregates } from '../application/queries/GetHistoryAggregates'
import { GetSessionAnalysis } from '../application/queries/GetSessionAnalysis'
import { AnalyzeSession } from '../application/commands/AnalyzeSession'
import { AnalyzeMatch } from '../application/commands/AnalyzeMatch'
import { GetMatchAnalysis } from '../application/queries/GetMatchAnalysis'
import { CoachChat } from '../application/commands/CoachChat'
import { FinalizeReflection } from '../application/commands/FinalizeReflection'
import { GetStandingTasks } from '../application/queries/GetStandingTasks'
import { GetProgress } from '../application/queries/GetProgress'
import { GetChatTranscript } from '../application/queries/GetChatTranscript'
import { SaveChatTranscript } from '../application/commands/SaveChatTranscript'
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

export function buildContainer() {
  const db = getDatabase()

  const matchRepo = new SqliteMatchRepository(db)
  const summonerRepo = new SqliteSummonerRepository(db)
  const reportRepo = new SqliteReportRepository(db)
  const sessionAnalysisRepo = new SqliteSessionAnalysisRepository(db)
  const sessionGoalRepo = new SqliteSessionGoalRepository(db)
  const semanticMemory = new SqliteSemanticMemory(db)
  const chatTranscriptRepo = new SqliteChatTranscriptRepository(db)
  const chatSessionRepo = new SqliteChatSessionRepository(db)
  const reflectionRepo = new SqliteReflectionRepository(db)
  const coachingConfigRepo = new SqliteCoachingConfigRepository(db)
  const riotClient = new RiotApiClient(config.riotApiKey)
  const coachingModel = new AnthropicCoachingModel(config.anthropicApiKey)
  const sessionCoachingModel = AnthropicSessionCoachingModel.fromApiKey(config.anthropicApiKey)
  // The match coach re-reads the user's edited coaching instructions on every
  // model invocation (cheap single-row read), so Settings edits apply live.
  const matchCoachingModel = AnthropicMatchCoachingModel.fromApiKey(config.anthropicApiKey, () =>
    Object.fromEntries(
      resolveConfig(coachingConfigRepo.get()).prompts.map((p) => [p.id, p.instructions])
    )
  )
  // Single shared OP.GG client (reusable across future features) + this feature's
  // narrow benchmark adapter over it.
  const opggClient = new OpggMcpClient()
  const benchmarkSource = new OpggBenchmarkDataSource(opggClient)

  const riotConfig = {
    riotId: config.riotId,
    platform: config.platform,
    region: config.region
  }

  const syncRecentMatches = new SyncRecentMatches(riotClient, matchRepo, riotConfig)
  const syncSummonerProfile = new SyncSummonerProfile(
    riotClient,
    riotClient,
    matchRepo,
    summonerRepo,
    riotConfig
  )

  const getMatchList = new GetMatchList(matchRepo)
  const getMatchPage = new GetMatchPage(matchRepo)
  const getMatchReport = new GetMatchReport(matchRepo)
  const getSummonerProfile = new GetSummonerProfile(matchRepo, summonerRepo)
  const getLpHistory = new GetLpHistory(matchRepo, summonerRepo)
  const getCoachReport = new GetCoachReport(reportRepo)
  const getHistoryAggregates = new GetHistoryAggregates(matchRepo)
  const analyzeSession = new AnalyzeSession(
    matchRepo,
    summonerRepo,
    sessionAnalysisRepo,
    sessionCoachingModel,
    config.anthropicModel,
    benchmarkSource,
    sessionGoalRepo
  )
  const analyzeMatch = new AnalyzeMatch(
    matchRepo,
    summonerRepo,
    reportRepo,
    matchCoachingModel,
    benchmarkSource,
    sessionGoalRepo,
    coachingConfigRepo,
    config.anthropicLightModel,
    config.anthropicHeavyModel
  )
  const getMatchAnalysis = new GetMatchAnalysis(reportRepo)
  // Post-game coaching chat runs entirely on the LIGHT tier — both the per-turn
  // replies AND the finalize step (write the reflection + lightly adjust focus
  // tasks). The chat is conversational and frequent, so it must stay cheap/fast;
  // never put it on the heavy model. (The heavy tier is reserved for the one-shot
  // match analysis passes, not the chat.)
  const coachChat = new CoachChat(
    matchRepo,
    reportRepo,
    sessionGoalRepo,
    semanticMemory,
    getHistoryAggregates,
    benchmarkSource,
    coachingConfigRepo,
    reflectionRepo,
    matchCoachingModel,
    config.anthropicLightModel
  )
  // The ONLY write path for model-initiated changes (spec 005): accept applies,
  // reject discards, staleness re-checked at accept time. The distillation hook
  // arrives with US5 (SummarizeIntoReflection wave).
  const resolveProposal = new ResolveProposal(
    matchRepo,
    reportRepo,
    chatSessionRepo,
    reflectionRepo
  )
  const saveReflection = new SaveReflection(matchRepo, reportRepo, reflectionRepo)
  const deleteReflection = new DeleteReflection(reflectionRepo)
  const listReflections = new ListReflections(reflectionRepo)
  const finalizeReflection = new FinalizeReflection(
    matchRepo,
    reportRepo,
    sessionGoalRepo,
    semanticMemory,
    matchCoachingModel,
    config.anthropicLightModel
  )
  const getStandingTasks = new GetStandingTasks(matchRepo, reportRepo)
  const getProgress = new GetProgress(matchRepo, reportRepo, semanticMemory)
  const getChatTranscript = new GetChatTranscript(chatTranscriptRepo)
  const saveChatTranscript = new SaveChatTranscript(chatTranscriptRepo)
  const getChatSessions = new GetChatSessions(chatSessionRepo)
  const saveChatSession = new SaveChatSession(chatSessionRepo)
  const getSessionAnalysis = new GetSessionAnalysis(matchRepo, sessionAnalysisRepo)
  const getSessionGoal = new GetSessionGoal(sessionGoalRepo)
  const saveSessionGoal = new SaveSessionGoal(sessionGoalRepo)
  const getCoachingConfig = new GetCoachingConfig(coachingConfigRepo)
  const saveCoachingConfig = new SaveCoachingConfig(coachingConfigRepo)
  const restoreCoachingConfigDefaults = new RestoreCoachingConfigDefaults(coachingConfigRepo)

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
    getMatchReport,
    getSummonerProfile,
    getLpHistory,
    getCoachReport,
    getHistoryAggregates,
    analyzeMatch,
    getMatchAnalysis,
    coachChat,
    finalizeReflection,
    getStandingTasks,
    getProgress,
    chatTranscriptRepo,
    getChatTranscript,
    saveChatTranscript,
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
