import type { DeathMap } from '@shared/types'
import { allEvents, MAP_MAX, round1 } from './raw'

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v))
}

/**
 * The player's death locations, normalized to 0–100% of the map with Y inverted
 * for screen space (US4 / research D2). Pure — no I/O.
 */
export function extractDeathMap(rawTimeline: unknown, participantId: number): DeathMap {
  const deaths = allEvents(rawTimeline)
    .filter((e) => e.type === 'CHAMPION_KILL' && e.victimId === participantId && e.position)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .map((e, i) => ({
      n: i + 1,
      tMin: round1((e.timestamp ?? 0) / 60_000),
      xPct: clamp(round1((e.position!.x / MAP_MAX) * 100)),
      yPct: clamp(round1((1 - e.position!.y / MAP_MAX) * 100))
    }))
  return { deaths, count: deaths.length }
}
