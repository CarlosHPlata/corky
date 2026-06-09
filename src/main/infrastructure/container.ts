import { getDatabase } from './database'
import { config } from './config'
import { SqliteMatchRepository } from '../adapters/driven/sqlite/SqliteMatchRepository'
import { SqliteSummonerRepository } from '../adapters/driven/sqlite/SqliteSummonerRepository'
import { SqliteReportRepository } from '../adapters/driven/sqlite/SqliteReportRepository'
import { RiotApiClient } from '../adapters/driven/riot/RiotApiClient'
import { AnthropicCoachingModel } from '../adapters/driven/anthropic/AnthropicCoachingModel'
import { SyncRecentMatches } from '../application/commands/SyncRecentMatches'
import { SyncSummonerProfile } from '../application/commands/SyncSummonerProfile'
import { GetMatchList } from '../application/queries/GetMatchList'
import { GetSummonerProfile } from '../application/queries/GetSummonerProfile'
import { GetLpHistory } from '../application/queries/GetLpHistory'
import { GetCoachReport } from '../application/queries/GetCoachReport'

export function buildContainer() {
  const db = getDatabase()

  const matchRepo = new SqliteMatchRepository(db)
  const summonerRepo = new SqliteSummonerRepository(db)
  const reportRepo = new SqliteReportRepository(db)
  const riotClient = new RiotApiClient(config.riotApiKey)
  const coachingModel = new AnthropicCoachingModel(config.anthropicApiKey)

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

  return {
    matchRepo,
    summonerRepo,
    reportRepo,
    coachingModel,
    syncRecentMatches,
    syncSummonerProfile,
    getMatchList,
    getSummonerProfile,
    getLpHistory,
    getCoachReport
  }
}
