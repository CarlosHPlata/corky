/**
 * Pure mapping from the League client's region string (e.g. "EUW", returned by
 * the LCU `riotclient/region-locale` endpoint) to the Riot Web API routing the
 * existing pipeline needs (spec 006, research §3).
 *
 * Two routes per shard, because the constitution forbids mixing them:
 *  - `platform` (e.g. `euw1`) → summoner-v4 / league-v4
 *  - `region`   (e.g. `europe`) → account-v1 / match-v5
 *
 * Unknown / empty input returns `null` so the caller falls back to a stored
 * value rather than guessing.
 */
export interface RiotRouting {
  platform: string
  region: string
}

const TABLE: Record<string, RiotRouting> = {
  EUW: { platform: 'euw1', region: 'europe' },
  EUNE: { platform: 'eun1', region: 'europe' },
  TR: { platform: 'tr1', region: 'europe' },
  RU: { platform: 'ru', region: 'europe' },
  NA: { platform: 'na1', region: 'americas' },
  BR: { platform: 'br1', region: 'americas' },
  LAN: { platform: 'la1', region: 'americas' },
  LA1: { platform: 'la1', region: 'americas' },
  LAS: { platform: 'la2', region: 'americas' },
  KR: { platform: 'kr', region: 'asia' },
  JP: { platform: 'jp1', region: 'asia' },
  OCE: { platform: 'oc1', region: 'sea' }
}

export function mapRegion(clientRegion: string): RiotRouting | null {
  const key = clientRegion.trim().toUpperCase()
  return TABLE[key] ?? null
}
