import { getDatabase } from './database'
import { config } from './config'
import { SqliteMatchRepository } from '../adapters/driven/sqlite/SqliteMatchRepository'
import { SqliteReportRepository } from '../adapters/driven/sqlite/SqliteReportRepository'
import { RiotApiClient } from '../adapters/driven/riot/RiotApiClient'
import { AnthropicCoachingModel } from '../adapters/driven/anthropic/AnthropicCoachingModel'
import { SyncRecentMatches } from '../application/commands/SyncRecentMatches'
import { GetMatchList } from '../application/queries/GetMatchList'
import { GetCoachReport } from '../application/queries/GetCoachReport'

export function buildContainer() {
  const db = getDatabase()

  const matchRepo = new SqliteMatchRepository(db)
  const reportRepo = new SqliteReportRepository(db)
  const riotClient = new RiotApiClient(config.riotApiKey)
  const coachingModel = new AnthropicCoachingModel(config.anthropicApiKey)

  const syncRecentMatches = new SyncRecentMatches(riotClient, matchRepo, {
    riotId: config.riotId,
    platform: config.platform,
    region: config.region
  })

  const account = matchRepo.getAccount(config.riotId) ?? { puuid: '' }
  const getMatchList = new GetMatchList(matchRepo, account.puuid)
  const getCoachReport = new GetCoachReport(reportRepo)

  return {
    matchRepo,
    reportRepo,
    coachingModel,
    syncRecentMatches,
    getMatchList,
    getCoachReport
  }
}
