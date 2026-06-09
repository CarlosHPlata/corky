import type { GoldFrame, Highlight } from '@shared/types'
import { allEvents, pidTeam, round1, type RawEvent } from './raw'

// Deterministic thresholds (research D3) — named so they're trivially tunable.
const FIGHT_GAP_MS = 15_000
const WIPE_MIN_DEATHS = 3
const WIPE_MIN_NET = 2
const SWING_WINDOW_MS = 90_000
const SWING_MIN_GOLD = 1_000

const MONSTER_LABEL: Record<string, string> = {
  RIFTHERALD: 'Rift Herald',
  BARON_NASHOR: 'Baron',
  ELDER_DRAGON: 'Elder dragon',
  DRAGON: 'Dragon'
}

function sideWord(side: 'ally' | 'enemy' | 'neutral'): string {
  return side === 'ally' ? 'your team' : side === 'enemy' ? 'enemy' : 'even'
}

function dragonLabel(e: RawEvent): string {
  const sub = e.monsterSubType // e.g. FIRE_DRAGON
  if (sub) {
    const name = sub.replace('_DRAGON', '').toLowerCase()
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} drake`
  }
  return 'Dragon'
}

function goldK(n: number): string {
  return (n >= 0 ? '+' : '−') + Math.abs(n / 1000).toFixed(1) + 'k'
}

/** Gold diff (player-team) nearest a given in-game minute. */
function goldAtMin(goldFrames: GoldFrame[], tMin: number): number {
  if (!goldFrames.length) return 0
  let best = goldFrames[0]
  for (const f of goldFrames) {
    if (f.tMin <= tMin) best = f
    else break
  }
  return best.goldDiff
}

/**
 * Data-inferred timeline highlights (FR-016/017/018). Deterministic rules over
 * the objective + kill event stream; descriptions are factual templates, never
 * coaching or LLM-written (FR-020). Output is sorted by time.
 */
export function inferHighlights(
  rawTimeline: unknown,
  playerTeamId: number,
  playerId: number,
  goldFrames: GoldFrame[]
): Highlight[] {
  const events = allEvents(rawTimeline)
  const highlights: Highlight[] = []

  // ── Objectives ──
  for (const e of events) {
    const t = round1((e.timestamp ?? 0) / 60_000)
    if (e.type === 'ELITE_MONSTER_KILL') {
      const killerTeam = e.killerTeamId ?? (e.killerId ? pidTeam(e.killerId) : 0)
      const side: Highlight['side'] = killerTeam === playerTeamId ? 'ally' : 'enemy'
      const name = e.monsterType === 'DRAGON' ? dragonLabel(e) : MONSTER_LABEL[e.monsterType ?? ''] ?? 'Objective'
      highlights.push({ tMin: t, kind: 'objective', side, label: `${name} — ${sideWord(side)}` })
    } else if (e.type === 'BUILDING_KILL' && e.buildingType === 'INHIBITOR_BUILDING') {
      // teamId is the team that LOST the inhibitor; the other side benefits.
      const side: Highlight['side'] = e.teamId === playerTeamId ? 'enemy' : 'ally'
      highlights.push({ tMin: t, kind: 'objective', side, label: `Inhibitor — ${sideWord(side)}` })
    }
  }

  // ── Team-wipe / almost-wiped: cluster kills by ≤ FIGHT_GAP_MS ──
  const kills = events
    .filter((e) => e.type === 'CHAMPION_KILL' && e.victimId != null)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))

  let cluster: RawEvent[] = []
  const flushCluster = (): void => {
    if (cluster.length < WIPE_MIN_DEATHS) return
    let allyDeaths = 0
    let enemyDeaths = 0
    for (const k of cluster) {
      if (pidTeam(k.victimId!) === playerTeamId) allyDeaths++
      else enemyDeaths++
    }
    const bigger = Math.max(allyDeaths, enemyDeaths)
    const smaller = Math.min(allyDeaths, enemyDeaths)
    if (bigger >= WIPE_MIN_DEATHS && bigger - smaller >= WIPE_MIN_NET) {
      const enemyWiped = enemyDeaths > allyDeaths
      const side: Highlight['side'] = enemyWiped ? 'ally' : 'enemy'
      const verb = bigger >= 4 && smaller <= 1 ? 'Team wiped' : 'Almost wiped'
      highlights.push({
        tMin: round1((cluster[0].timestamp ?? 0) / 60_000),
        kind: 'teamfight',
        side,
        label: `${verb} ${bigger}–${smaller}`,
        detail: `${enemyDeaths} enemy and ${allyDeaths} ally deaths in a single fight.`
      })
    }
  }
  for (const k of kills) {
    if (cluster.length && (k.timestamp ?? 0) - (cluster[cluster.length - 1].timestamp ?? 0) > FIGHT_GAP_MS) {
      flushCluster()
      cluster = []
    }
    cluster.push(k)
  }
  flushCluster()

  // ── Death → gold swing: a player death followed by a swing against the team ──
  for (const k of kills) {
    if (k.victimId !== playerId) continue
    const tMs = k.timestamp ?? 0
    const before = goldAtMin(goldFrames, tMs / 60_000)
    const after = goldAtMin(goldFrames, (tMs + SWING_WINDOW_MS) / 60_000)
    const swing = after - before
    if (swing <= -SWING_MIN_GOLD) {
      highlights.push({
        tMin: round1(tMs / 60_000),
        kind: 'death',
        side: 'enemy',
        label: `Death → ${goldK(swing)}`,
        detail: 'Your death was followed by a gold swing against your team.'
      })
    }
  }

  return highlights.sort((a, b) => a.tMin - b.tMin)
}
