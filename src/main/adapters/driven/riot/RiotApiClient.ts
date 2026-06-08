import Bottleneck from 'bottleneck'
import type { Account, MatchDetail, Timeline } from '@shared/types'
import type { MatchDataSource } from '../../../application/ports/MatchDataSource'

const limiter = new Bottleneck({
  reservoir: 20,
  reservoirRefreshAmount: 20,
  reservoirRefreshInterval: 1000,
  maxConcurrent: 5
})

async function riotFetch(url: string, apiKey: string): Promise<unknown> {
  const res = await limiter.schedule(() =>
    fetch(url, { headers: { 'X-Riot-Token': apiKey } })
  )
  if (!res.ok) {
    throw new Error(`Riot API error ${res.status} for ${url}`)
  }
  return res.json()
}

export class RiotApiClient implements MatchDataSource {
  constructor(private readonly apiKey: string) {}

  async resolveAccount(riotId: string, _platform: string, region: string): Promise<Account> {
    const [gameName, tagLine] = riotId.split('#')
    const url = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    const data = (await riotFetch(url, this.apiKey)) as { puuid: string; gameName: string; tagLine: string }
    return {
      puuid: data.puuid,
      gameName: data.gameName,
      tagLine: data.tagLine,
      platform: _platform,
      region
    }
  }

  async listMatchIds(puuid: string, region: string, count: number): Promise<string[]> {
    const url = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=${count}&queue=420`
    return (await riotFetch(url, this.apiKey)) as string[]
  }

  async fetchMatchDetail(matchId: string, region: string): Promise<MatchDetail> {
    const url = `https://${region}.api.riotgames.com/lol/match/v5/matches/${matchId}`
    const data = await riotFetch(url, this.apiKey)
    return { matchId, rawJson: JSON.stringify(data) }
  }

  async fetchTimeline(matchId: string, region: string): Promise<Timeline> {
    const url = `https://${region}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`
    const data = await riotFetch(url, this.apiKey)
    return { matchId, rawJson: JSON.stringify(data) }
  }
}
