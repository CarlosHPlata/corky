import { getDatabase } from './database'
import { config } from './config'
import { SqliteMatchRepository } from '../adapters/driven/sqlite/SqliteMatchRepository'
import { SqliteSummonerRepository } from '../adapters/driven/sqlite/SqliteSummonerRepository'
import { SqliteReportRepository } from '../adapters/driven/sqlite/SqliteReportRepository'
import { SqliteSessionAnalysisRepository } from '../adapters/driven/sqlite/SqliteSessionAnalysisRepository'
import { SqliteSessionGoalRepository } from '../adapters/driven/sqlite/SqliteSessionGoalRepository'
import { RiotApiClient } from '../adapters/driven/riot/RiotApiClient'
import { AnthropicCoachingModel } from '../adapters/driven/anthropic/AnthropicCoachingModel'
import { AnthropicSessionCoachingModel } from '../adapters/driven/anthropic/AnthropicSessionCoachingModel'
import { OpggMcpClient } from '../adapters/driven/opgg/OpggMcpClient'
import { OpggBenchmarkDataSource } from '../adapters/driven/opgg/OpggBenchmarkDataSource'
import { SyncRecentMatches } from '../application/commands/SyncRecentMatches'
import { SyncSummonerProfile } from '../application/commands/SyncSummonerProfile'
import { GetMatchList } from '../application/queries/GetMatchList'
import { GetSummonerProfile } from '../application/queries/GetSummonerProfile'
import { GetLpHistory } from '../application/queries/GetLpHistory'
import { GetCoachReport } from '../application/queries/GetCoachReport'
import { GetSessionAnalysis } from '../application/queries/GetSessionAnalysis'
import { AnalyzeSession } from '../application/commands/AnalyzeSession'
import { GetSessionGoal } from '../application/queries/GetSessionGoal'
import { SaveSessionGoal } from '../application/commands/SaveSessionGoal'

export function buildContainer() {
  const db = getDatabase()

  const matchRepo = new SqliteMatchRepository(db)
  const summonerRepo = new SqliteSummonerRepository(db)
  const reportRepo = new SqliteReportRepository(db)
  const sessionAnalysisRepo = new SqliteSessionAnalysisRepository(db)
  const sessionGoalRepo = new SqliteSessionGoalRepository(db)
  const riotClient = new RiotApiClient(config.riotApiKey)
  const coachingModel = new AnthropicCoachingModel(config.anthropicApiKey)
  const sessionCoachingModel = AnthropicSessionCoachingModel.fromApiKey(config.anthropicApiKey)
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
  const getSummonerProfile = new GetSummonerProfile(matchRepo, summonerRepo)
  const getLpHistory = new GetLpHistory(matchRepo, summonerRepo)
  const getCoachReport = new GetCoachReport(reportRepo)
  const analyzeSession = new AnalyzeSession(
    matchRepo,
    summonerRepo,
    sessionAnalysisRepo,
    sessionCoachingModel,
    config.anthropicModel,
    benchmarkSource,
    sessionGoalRepo
  )
  const getSessionAnalysis = new GetSessionAnalysis(matchRepo, sessionAnalysisRepo)
  const getSessionGoal = new GetSessionGoal(sessionGoalRepo)
  const saveSessionGoal = new SaveSessionGoal(sessionGoalRepo)

  return {
    matchRepo,
    summonerRepo,
    reportRepo,
    sessionAnalysisRepo,
    sessionGoalRepo,
    coachingModel,
    sessionCoachingModel,
    opggClient,
    benchmarkSource,
    syncRecentMatches,
    syncSummonerProfile,
    getMatchList,
    getSummonerProfile,
    getLpHistory,
    getCoachReport,
    analyzeSession,
    getSessionAnalysis,
    getSessionGoal,
    saveSessionGoal
  }
}
