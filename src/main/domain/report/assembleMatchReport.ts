import type { MatchReport } from '@shared/types'
import { frames, participants } from './raw'
import { extractCore, extractMatchup, resolveLaneOpponentId } from './matchReportCore'
import { extractBreakdown } from './breakdown'
import { extractGoldTimeline } from './goldTimeline'
import { inferHighlights } from './highlights'
import { extractDeathMap } from './deathMap'

/**
 * Compose the full FACTUAL match report from stored raw JSON (pure — no I/O).
 * When `rawTimeline` is null/empty the report degrades: core + matchup + the
 * detail-only breakdown fields still render; the gold timeline, highlights,
 * death map and timeline-dependent breakdown fields are omitted (FR-025).
 */
export function assembleMatchReport(
  rawMatch: unknown,
  rawTimeline: unknown | null,
  puuid: string,
  itemNames: ReadonlyMap<number, string>
): MatchReport {
  const matchId = (rawMatch as { metadata?: { matchId?: string } })?.metadata?.matchId ?? ''
  const me = participants(rawMatch).find((p) => p.puuid === puuid)
  const playerId = me?.participantId ?? -1
  const playerTeamId = me?.teamId ?? 100
  const laneOpponentId = resolveLaneOpponentId(rawMatch, puuid)

  const hasTimeline = rawTimeline != null && frames(rawTimeline).length > 0

  const core = extractCore(rawMatch, puuid)
  const matchup = extractMatchup(rawMatch, puuid, itemNames)
  const breakdown = extractBreakdown(rawMatch, rawTimeline ?? null, puuid, laneOpponentId)

  if (!hasTimeline) {
    return { matchId, core, matchup, breakdown, timeline: null, deathMap: null, timelineAvailable: false }
  }

  const { frames: goldFrames, endMin } = extractGoldTimeline(rawTimeline, playerTeamId)
  const highlights = inferHighlights(rawTimeline, playerTeamId, playerId, goldFrames)
  const deathMap = extractDeathMap(rawTimeline, playerId)

  return {
    matchId,
    core,
    matchup,
    breakdown,
    timeline: { frames: goldFrames, endMin, highlights },
    deathMap,
    timelineAvailable: true
  }
}
