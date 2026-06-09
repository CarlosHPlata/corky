import type { MatchCore, Matchup, RosterEntry } from '@shared/types'
import { matchInfo, participants, round1, type RawParticipant } from './raw'

const ROLE_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']
// Jungle isn't a lane — a jungler has no fixed lane opponent (FR-012).
const LANE_POSITIONS = ['TOP', 'MIDDLE', 'BOTTOM', 'UTILITY']
const ROLE_LABEL: Record<string, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  BOTTOM: 'Bot',
  UTILITY: 'Support'
}

function roleLabel(teamPosition: string | undefined): string {
  return ROLE_LABEL[teamPosition ?? ''] ?? 'Unknown'
}

function roleIndex(teamPosition: string | undefined): number {
  const i = ROLE_ORDER.indexOf(teamPosition ?? '')
  return i === -1 ? ROLE_ORDER.length : i
}

/** Headline economy line for the player's game. Pure — no I/O. */
export function extractCore(rawMatch: unknown, puuid: string): MatchCore {
  const info = matchInfo(rawMatch)
  const p = participants(rawMatch).find((x) => x.puuid === puuid) ?? {}

  const durationSec = info.gameDuration ?? 0
  const minutes = durationSec > 0 ? durationSec / 60 : 0
  const kills = p.kills ?? 0
  const deaths = p.deaths ?? 0
  const assists = p.assists ?? 0
  const cs = (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0)
  const gold = p.goldEarned ?? 0

  return {
    champion: p.championName ?? 'Unknown',
    role: roleLabel(p.teamPosition),
    win: p.win ?? false,
    kills,
    deaths,
    assists,
    kdaRatio: round1((kills + assists) / Math.max(1, deaths)),
    cs,
    csPerMin: minutes > 0 ? round1(cs / minutes) : 0,
    gold,
    goldPerMin: minutes > 0 ? Math.round(gold / minutes) : 0,
    durationSec,
    queue: info.queueId ?? 0
  }
}

/** The participantId of the single opposed lane opponent, or null (FR-012). */
export function resolveLaneOpponentId(rawMatch: unknown, puuid: string): number | null {
  const all = participants(rawMatch)
  const you = all.find((p) => p.puuid === puuid)
  const youPos = you?.teamPosition
  if (!youPos || !LANE_POSITIONS.includes(youPos)) return null
  const opposed = all.filter((p) => p.teamId !== you?.teamId && p.teamPosition === youPos)
  return opposed.length === 1 ? opposed[0].participantId ?? null : null
}

function toRosterEntry(p: RawParticipant, isYou: boolean, isLaneOpponent: boolean): RosterEntry {
  return {
    champion: p.championName ?? 'Unknown',
    role: roleLabel(p.teamPosition),
    teamId: p.teamId ?? 0,
    isYou,
    isLaneOpponent,
    kills: p.kills ?? 0,
    deaths: p.deaths ?? 0,
    assists: p.assists ?? 0,
    cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
    gold: p.goldEarned ?? 0
  }
}

/**
 * Lanes for one game. The lane opponent is the single enemy sharing the player's
 * `teamPosition`; when there isn't exactly one (jungle/roam, or a non-lane mode)
 * it resolves to null — stated honestly rather than guessed (FR-012).
 */
export function extractMatchup(rawMatch: unknown, puuid: string): Matchup {
  const all = participants(rawMatch)
  const you = all.find((p) => p.puuid === puuid)
  const youTeam = you?.teamId ?? 100
  const youPos = you?.teamPosition

  const sameTeamOpposed =
    youPos && LANE_POSITIONS.includes(youPos)
      ? all.filter((p) => p.teamId !== youTeam && p.teamPosition === youPos)
      : []
  const laneOppParticipant = sameTeamOpposed.length === 1 ? sameTeamOpposed[0] : null

  const order = (a: RawParticipant, b: RawParticipant) =>
    roleIndex(a.teamPosition) - roleIndex(b.teamPosition)

  const allies = all
    .filter((p) => p.teamId === youTeam)
    .sort(order)
    .map((p) => toRosterEntry(p, p.puuid === puuid, false))

  const enemies = all
    .filter((p) => p.teamId !== youTeam)
    .sort(order)
    .map((p) => toRosterEntry(p, false, p === laneOppParticipant))

  const youEntry =
    allies.find((e) => e.isYou) ??
    (you
      ? toRosterEntry(you, true, false)
      : { champion: 'Unknown', role: 'Unknown', teamId: youTeam, isYou: true, isLaneOpponent: false, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0 })

  const laneOpponent = laneOppParticipant
    ? toRosterEntry(laneOppParticipant, false, true)
    : null

  return { you: youEntry, laneOpponent, allies, enemies }
}
