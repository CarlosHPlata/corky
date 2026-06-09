// Shared, framework-free helpers for reading stored raw match-v5 JSON.
// Pure (no imports, no I/O). The raw JSON is untrusted, so every field is optional.

/** Summoner's Rift world-coordinate extent (both axes run ~0..14870). */
export const MAP_MAX = 14870

export interface RawParticipant {
  participantId?: number
  puuid?: string
  teamId?: number
  teamPosition?: string
  championName?: string
  win?: boolean
  kills?: number
  deaths?: number
  assists?: number
  totalMinionsKilled?: number
  neutralMinionsKilled?: number
  goldEarned?: number
  visionScore?: number
  challenges?: { killParticipation?: number }
}

export interface RawMatch {
  metadata?: { matchId?: string }
  info?: {
    queueId?: number
    gameCreation?: number
    gameDuration?: number
    participants?: RawParticipant[]
  }
}

export interface Position {
  x: number
  y: number
}

export interface RawEvent {
  type?: string
  timestamp?: number
  killerId?: number
  killerTeamId?: number
  victimId?: number
  assistingParticipantIds?: number[]
  monsterType?: string
  monsterSubType?: string
  buildingType?: string
  teamId?: number
  position?: Position
}

export interface RawParticipantFrame {
  participantId?: number
  totalGold?: number
  minionsKilled?: number
  jungleMinionsKilled?: number
  position?: Position
}

export interface RawFrame {
  timestamp?: number
  participantFrames?: Record<string, RawParticipantFrame>
  events?: RawEvent[]
}

export interface RawTimeline {
  info?: {
    frameInterval?: number
    frames?: RawFrame[]
  }
}

/** Riot convention: participantIds 1–5 are team 100, 6–10 are team 200. */
export function pidTeam(pid: number): number {
  return pid <= 5 ? 100 : 200
}

export function matchInfo(raw: unknown): NonNullable<RawMatch['info']> {
  return (raw as RawMatch)?.info ?? {}
}

export function participants(raw: unknown): RawParticipant[] {
  return matchInfo(raw).participants ?? []
}

export function frames(rawTimeline: unknown): RawFrame[] {
  return (rawTimeline as RawTimeline)?.info?.frames ?? []
}

export function allEvents(rawTimeline: unknown): RawEvent[] {
  return frames(rawTimeline).flatMap((f) => f.events ?? [])
}

/** The frame at-or-before `ms`, but only when the game actually reached `ms`. */
export function frameAtOrBefore(fs: RawFrame[], ms: number): RawFrame | null {
  const reached = fs.some((f) => (f.timestamp ?? 0) >= ms)
  if (!reached) return null
  let best: RawFrame | null = null
  for (const f of fs) {
    if ((f.timestamp ?? 0) <= ms) best = f
  }
  return best ?? fs[0] ?? null
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}
