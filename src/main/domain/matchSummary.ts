import type { MatchSummary } from '@shared/types'

/** Raw match-v5 participant fields we read. Loosely typed — the raw JSON is untrusted. */
interface RawParticipant {
  puuid: string
  championName?: string
  win?: boolean
  kills?: number
  deaths?: number
  assists?: number
  totalMinionsKilled?: number
  neutralMinionsKilled?: number
  goldEarned?: number
  teamPosition?: string
}

interface RawMatch {
  metadata?: { matchId?: string }
  info?: {
    queueId?: number
    gameCreation?: number
    gameDuration?: number
    participants?: RawParticipant[]
  }
}

/** Map Riot `teamPosition` codes to the labels the UI uses. */
function normalizeRole(teamPosition: string | undefined): string {
  switch (teamPosition) {
    case 'TOP':
      return 'Top'
    case 'JUNGLE':
      return 'Jungle'
    case 'MIDDLE':
      return 'Mid'
    case 'BOTTOM':
      return 'Bot'
    case 'UTILITY':
      return 'Support'
    default:
      return 'Unknown'
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Project a stored raw match-v5 object onto the {@link MatchSummary} read model
 * for one player. Pure — no I/O. `gameDuration` is treated as seconds.
 */
export function extractMatchSummary(raw: RawMatch, puuid: string): MatchSummary {
  const info = raw.info ?? {}
  const participant = info.participants?.find((p) => p.puuid === puuid)

  const durationSec = info.gameDuration ?? 0
  const durationMin = durationSec > 0 ? durationSec / 60 : 0
  const cs = (participant?.totalMinionsKilled ?? 0) + (participant?.neutralMinionsKilled ?? 0)
  const gold = participant?.goldEarned ?? 0

  return {
    matchId: raw.metadata?.matchId ?? '',
    puuid,
    queue: info.queueId ?? 0,
    champion: participant?.championName ?? 'Unknown',
    role: normalizeRole(participant?.teamPosition),
    win: participant?.win ?? false,
    kills: participant?.kills ?? 0,
    deaths: participant?.deaths ?? 0,
    assists: participant?.assists ?? 0,
    cs,
    csPerMin: durationMin > 0 ? round1(cs / durationMin) : 0,
    gold,
    goldPerMin: durationMin > 0 ? Math.round(gold / durationMin) : 0,
    gameCreation: info.gameCreation ?? 0,
    gameDuration: durationSec
  }
}
