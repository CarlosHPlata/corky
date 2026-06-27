import type {
  ChampSelectBan,
  ChampSelectPlayer,
  ChampSelectState
} from '@shared/types'

/**
 * Pure mapping of the raw LCU `/lol-champ-select/v1/session` payload into the
 * `ChampSelectState` DTO (spec 007) — the testable heart of the champ-select
 * feed. No I/O and no Data Dragon: it stays structural (numeric champion/spell
 * ids, LCU-provided names), and the renderer resolves ids→names/icons.
 *
 * `localRunes`, `build` and `matchup` are filled in by the service (they need
 * separate reads / OP.GG), so this returns them null. Returns null when the
 * payload isn't a usable session (e.g. a Delete event clearing champ select).
 */
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function asNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function asStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Cell ids that currently have an in-progress (not yet completed) action. */
function actingCellIds(actions: unknown): Set<number> {
  const acting = new Set<number>()
  for (const group of asArray(actions)) {
    for (const action of asArray(group)) {
      const a = asRecord(action)
      if (a && a.isInProgress === true && a.completed !== true) {
        acting.add(asNum(a.actorCellId))
      }
    }
  }
  return acting
}

function toPlayer(
  raw: unknown,
  team: 'ally' | 'enemy',
  localCellId: number,
  acting: Set<number>
): ChampSelectPlayer | null {
  const c = asRecord(raw)
  if (!c) return null
  const cellId = asNum(c.cellId)
  return {
    cellId,
    team,
    isLocalPlayer: team === 'ally' && cellId === localCellId,
    assignedPosition: asStr(c.assignedPosition),
    championId: asNum(c.championId),
    championPickIntent: asNum(c.championPickIntent),
    gameName: asStr(c.gameName),
    tagLine: asStr(c.tagLine),
    summonerSpellIds: [asNum(c.spell1Id), asNum(c.spell2Id)],
    isActing: acting.has(cellId)
  }
}

function toBans(bans: unknown): ChampSelectBan[] {
  const b = asRecord(bans)
  if (!b) return []
  const out: ChampSelectBan[] = []
  for (const id of asArray(b.myTeamBans)) {
    const championId = asNum(id)
    if (championId > 0) out.push({ championId, team: 'ally' })
  }
  for (const id of asArray(b.theirTeamBans)) {
    const championId = asNum(id)
    if (championId > 0) out.push({ championId, team: 'enemy' })
  }
  return out
}

export function mapChampSelectSession(raw: unknown): ChampSelectState | null {
  const s = asRecord(raw)
  if (!s || !Array.isArray(s.myTeam)) return null

  const localPlayerCellId = asNum(s.localPlayerCellId)
  const acting = actingCellIds(s.actions)
  const timer = asRecord(s.timer)

  const allies = asArray(s.myTeam)
    .map((c) => toPlayer(c, 'ally', localPlayerCellId, acting))
    .filter((p): p is ChampSelectPlayer => p !== null)
  const enemies = asArray(s.theirTeam)
    .map((c) => toPlayer(c, 'enemy', localPlayerCellId, acting))
    .filter((p): p is ChampSelectPlayer => p !== null)

  return {
    active: true,
    phase: asStr(timer?.phase),
    timeLeftSec: Math.max(0, Math.round(asNum(timer?.adjustedTimeLeftInPhase) / 1000)),
    localPlayerCellId,
    allies,
    enemies,
    bans: toBans(s.bans),
    localRunes: null,
    build: null,
    matchup: null
  }
}

/** The local player's own cell, or null (e.g. spectating). Convenience for the
 *  service when it needs the picked champion / assigned role for OP.GG (slice 2). */
export function localPlayer(state: ChampSelectState): ChampSelectPlayer | null {
  return state.allies.find((p) => p.isLocalPlayer) ?? null
}

/** The enemy in the same assigned role as the local player — the inferred lane
 *  opponent. Null when roles are hidden or the opponent hasn't been matched yet
 *  (spec 007, point 5). */
export function inferEnemyLaner(state: ChampSelectState): ChampSelectPlayer | null {
  const me = localPlayer(state)
  if (!me || !me.assignedPosition) return null
  return state.enemies.find((e) => e.assignedPosition === me.assignedPosition) ?? null
}
