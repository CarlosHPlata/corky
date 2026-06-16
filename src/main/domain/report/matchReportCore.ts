import type { Item, MatchCore, Matchup, RosterEntry, TeamObjectives } from '@shared/types'
import { matchInfo, participants, round1, type RawParticipant, type RawTeam } from './raw'

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

function toRosterEntry(p: RawParticipant, isYou: boolean, isLaneOpponent: boolean, itemNames: ReadonlyMap<number, string>): RosterEntry {
  // The rune page: styles[0] is the primary tree (its first selection is the
  // keystone), styles[1] the secondary tree. Untrusted raw — every step guarded.
  const styles = p.perks?.styles ?? []
  const primary = styles.find((s) => s.description === 'primaryStyle') ?? styles[0]
  const sub = styles.find((s) => s.description === 'subStyle') ?? styles[1]
  const itemIds = [p.item0 ?? 0, p.item1 ?? 0, p.item2 ?? 0, p.item3 ?? 0, p.item4 ?? 0, p.item5 ?? 0]

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
    gold: p.goldEarned ?? 0,
    champLevel: p.champLevel ?? 0,
    damageToChampions: p.totalDamageDealtToChampions ?? 0,
    riotId: p.riotIdGameName ?? '',
    summonerSpellIds: [p.summoner1Id ?? 0, p.summoner2Id ?? 0],
    keystoneId: primary?.selections?.[0]?.perk ?? null,
    primaryStyleId: primary?.style ?? null,
    subStyleId: sub?.style ?? null,
    itemIds,
    trinketId: p.item6 ?? 0,
    trinket: buildItemsFromIds([p.item6 ?? 0], itemNames)[0],
    items: buildItemsFromIds(itemIds, itemNames)
  }
}

function buildItemsFromIds(itemIds: number[], itemNames: ReadonlyMap<number, string>): Item[] {
  return itemIds.map((id) => ({
    id,
    name: itemNames.get(id) ?? 'Unknown'
  }))
}

function toObjectives(t: RawTeam | undefined): TeamObjectives | null {
  if (!t?.objectives) return null
  return {
    towers: t.objectives.tower?.kills ?? 0,
    dragons: t.objectives.dragon?.kills ?? 0,
    barons: t.objectives.baron?.kills ?? 0
  }
}

/**
 * Lanes for one game. The lane opponent is the single enemy sharing the player's
 * `teamPosition`; when there isn't exactly one (jungle/roam, or a non-lane mode)
 * it resolves to null — stated honestly rather than guessed (FR-012).
 */
export function extractMatchup(rawMatch: unknown, puuid: string, itemNames: ReadonlyMap<number, string>): Matchup {
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
    .map((p) => toRosterEntry(p, p.puuid === puuid, false, itemNames))

  const enemies = all
    .filter((p) => p.teamId !== youTeam)
    .sort(order)
    .map((p) => toRosterEntry(p, false, p === laneOppParticipant, itemNames))

  const youEntry = allies.find((e) => e.isYou) ?? toRosterEntry(you ?? {}, true, false, itemNames)

  const laneOpponent = laneOppParticipant
    ? toRosterEntry(laneOppParticipant, false, true, itemNames)
    : null

  const teams = matchInfo(rawMatch).teams ?? []
  const allyObjectives = toObjectives(teams.find((t) => t.teamId === youTeam))
  const enemyObjectives = toObjectives(teams.find((t) => (t.teamId ?? 0) !== youTeam && t.teamId != null))

  return { you: youEntry, laneOpponent, allies, enemies, allyObjectives, enemyObjectives }
}
