import Bottleneck from 'bottleneck'
import type { Account, MatchDetail, Timeline, RankInfo } from '@shared/types'
import type { MatchDataSource } from '../../../application/ports/MatchDataSource'
import type {
  SummonerDataSource,
  SummonerProfileData
} from '../../../application/ports/SummonerDataSource'

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

export class RiotApiClient implements MatchDataSource, SummonerDataSource {
  constructor(private readonly apiKey: string) {}

  async resolveAccount(riotId: string, _platform: string, region: string): Promise<Account> {
    const [gameName, tagLine] = riotId.split('#')
    if (!gameName || !tagLine) {
      throw new Error(
        `Invalid RIOT_ID "${riotId}" — expected gameName#tagLine (e.g. Faker#KR1). ` +
          `In .env, wrap it in quotes so the '#' isn't treated as a comment: RIOT_ID="Name#TAG".`
      )
    }
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

  async listMatchIds(puuid: string, region: string, count: number, start = 0): Promise<string[]> {
    const url = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}&queue=420`
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

  async fetchProfile(puuid: string, platform: string): Promise<SummonerProfileData> {
    const url = `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`
    const data = (await riotFetch(url, this.apiKey)) as {
      profileIconId: number
      summonerLevel: number
    }
    return { profileIconId: data.profileIconId, summonerLevel: data.summonerLevel }
  }

  async fetchSoloRank(puuid: string, platform: string): Promise<RankInfo | null> {
    const url = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`
    const entries = (await riotFetch(url, this.apiKey)) as Array<{
      queueType: string
      tier: string
      rank: string
      leaguePoints: number
      wins: number
      losses: number
    }>
    const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5')
    if (!solo) return null
    return {
      queueType: solo.queueType,
      tier: solo.tier,
      division: solo.rank,
      leaguePoints: solo.leaguePoints,
      wins: solo.wins,
      losses: solo.losses
    }
  }
}
