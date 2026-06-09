import type { Breakdown } from '@shared/types'
import {
  allEvents, frameAtOrBefore, frames, participants, pidTeam, round1,
  type RawFrame, type RawParticipantFrame
} from './raw'

const CS_AT_10_MS = 600_000
const GOLD_AT_14_MS = 840_000
const GOLD_AT_24_MS = 1_440_000
/** A death is "solo" when no ally is within this many world units of it. */
const SOLO_RADIUS = 2_500

function pframe(frame: RawFrame | null, pid: number): RawParticipantFrame | undefined {
  return frame?.participantFrames?.[String(pid)]
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * The decided-by-numbers block (FR-013/014). Breakpoint metrics return null when
 * the game never reached them, never a fabricated 0.
 */
export function extractBreakdown(
  rawMatch: unknown,
  rawTimeline: unknown,
  puuid: string,
  laneOpponentId: number | null
): Breakdown {
  const all = participants(rawMatch)
  const me = all.find((p) => p.puuid === puuid)
  const myId = me?.participantId ?? -1
  const myTeam = me?.teamId ?? 100

  const durationSec = (rawMatch as { info?: { gameDuration?: number } })?.info?.gameDuration ?? 0
  const minutes = durationSec > 0 ? durationSec / 60 : 0
  const cs = (me?.totalMinionsKilled ?? 0) + (me?.neutralMinionsKilled ?? 0)

  const fs = frames(rawTimeline)

  // CS @ 10 — minions+jungle at the 10:00 frame.
  const at10 = frameAtOrBefore(fs, CS_AT_10_MS)
  const myAt10 = pframe(at10, myId)
  const csAt10 =
    at10 && myAt10 ? (myAt10.minionsKilled ?? 0) + (myAt10.jungleMinionsKilled ?? 0) : null

  // Gold @ 14 / @ 24 — player vs lane opponent gold difference at the mark.
  const goldDiffAt = (ms: number): number | null => {
    if (laneOpponentId == null) return null
    const frame = frameAtOrBefore(fs, ms)
    if (!frame) return null
    const mine = pframe(frame, myId)?.totalGold
    const theirs = pframe(frame, laneOpponentId)?.totalGold
    if (mine == null || theirs == null) return null
    return mine - theirs
  }

  // Solo deaths — player deaths with no ally within SOLO_RADIUS at the time.
  let soloDeaths = 0
  for (const e of allEvents(rawTimeline)) {
    if (e.type !== 'CHAMPION_KILL' || e.victimId !== myId || !e.position) continue
    const nearby = frameAtOrBefore(fs, e.timestamp ?? 0)
    let allyNear = false
    if (nearby?.participantFrames) {
      for (const [pidStr, pf] of Object.entries(nearby.participantFrames)) {
        const pid = Number(pidStr)
        if (pid === myId || pidTeam(pid) !== myTeam || !pf.position) continue
        if (dist(pf.position, e.position) <= SOLO_RADIUS) {
          allyNear = true
          break
        }
      }
    }
    if (!allyNear) soloDeaths++
  }

  // Kill participation — prefer Riot's challenge, else (k+a)/teamKills.
  const teamKills = all
    .filter((p) => p.teamId === myTeam)
    .reduce((s, p) => s + (p.kills ?? 0), 0)
  const killParticipation =
    me?.challenges?.killParticipation ??
    (teamKills > 0 ? ((me?.kills ?? 0) + (me?.assists ?? 0)) / teamKills : 0)

  return {
    csAt10,
    csPerMin: minutes > 0 ? round1(cs / minutes) : 0,
    goldAt14: goldDiffAt(GOLD_AT_14_MS),
    goldAt24: goldDiffAt(GOLD_AT_24_MS),
    visionScore: me?.visionScore ?? 0,
    soloDeaths,
    killParticipation: round1(killParticipation * 100) / 100
  }
}
