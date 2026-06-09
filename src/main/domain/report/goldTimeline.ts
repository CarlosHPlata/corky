import type { GoldFrame } from '@shared/types'
import { frames, pidTeam, round1 } from './raw'

/**
 * Team gold-difference curve, signed positive when the player's team is ahead
 * (US3). Sampled at the timeline's frame interval. Pure — no I/O.
 */
export function extractGoldTimeline(
  rawTimeline: unknown,
  playerTeamId: number
): { frames: GoldFrame[]; endMin: number } {
  const out: GoldFrame[] = frames(rawTimeline).map((f) => {
    let ally = 0
    let enemy = 0
    for (const [pidStr, pf] of Object.entries(f.participantFrames ?? {})) {
      const g = pf.totalGold ?? 0
      if (pidTeam(Number(pidStr)) === playerTeamId) ally += g
      else enemy += g
    }
    return { tMin: round1((f.timestamp ?? 0) / 60_000), goldDiff: ally - enemy }
  })
  const endMin = out.length ? out[out.length - 1].tMin : 0
  return { frames: out, endMin }
}
