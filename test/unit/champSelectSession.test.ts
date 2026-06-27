import { describe, it, expect } from 'vitest'
import {
  mapChampSelectSession,
  localPlayer,
  inferEnemyLaner
} from '../../src/main/domain/champSelect/session'

/** Trimmed from a real `/lol-champ-select/v1/session` capture (the fields the
 *  mapper reads): localPlayer is cell 0, mid-lane, with an in-progress pick. */
const SESSION = {
  localPlayerCellId: 0,
  bans: { myTeamBans: [], theirTeamBans: [], numBans: 0 },
  myTeam: [
    {
      cellId: 0,
      championId: 0,
      championPickIntent: 0,
      assignedPosition: 'middle',
      gameName: 'kingskull',
      tagLine: '619',
      spell1Id: 6,
      spell2Id: 7
    },
    { cellId: 1, championId: 31, championPickIntent: 0, assignedPosition: 'jungle', gameName: '', tagLine: '', spell1Id: 4, spell2Id: 11 },
    { cellId: 2, championId: 57, championPickIntent: 0, assignedPosition: 'top', gameName: '', tagLine: '', spell1Id: 4, spell2Id: 12 },
    { cellId: 3, championId: 498, championPickIntent: 0, assignedPosition: 'bottom', gameName: '', tagLine: '', spell1Id: 21, spell2Id: 4 },
    { cellId: 4, championId: 14, championPickIntent: 0, assignedPosition: 'utility', gameName: '', tagLine: '', spell1Id: 4, spell2Id: 14 }
  ],
  theirTeam: [
    { cellId: 5, championId: 0, assignedPosition: '', gameName: '', tagLine: '', spell1Id: 0, spell2Id: 0, nameVisibilityType: 'HIDDEN' },
    { cellId: 6, championId: 0, assignedPosition: '', gameName: '', tagLine: '', spell1Id: 0, spell2Id: 0, nameVisibilityType: 'HIDDEN' }
  ],
  actions: [
    [{ actorCellId: 0, championId: 0, completed: false, isInProgress: true, type: 'pick', pickTurn: 0 }]
  ],
  timer: { adjustedTimeLeftInPhase: 90000, phase: 'BAN_PICK', isInfinite: false }
}

describe('mapChampSelectSession', () => {
  it('maps the header fields', () => {
    const s = mapChampSelectSession(SESSION)!
    expect(s.active).toBe(true)
    expect(s.phase).toBe('BAN_PICK')
    expect(s.timeLeftSec).toBe(90)
    expect(s.localPlayerCellId).toBe(0)
  })

  it('maps the local player with spells, role and the in-progress action flag', () => {
    const s = mapChampSelectSession(SESSION)!
    expect(s.allies).toHaveLength(5)
    const me = s.allies[0]
    expect(me).toMatchObject({
      cellId: 0,
      team: 'ally',
      isLocalPlayer: true,
      assignedPosition: 'middle',
      championId: 0,
      gameName: 'kingskull',
      tagLine: '619',
      summonerSpellIds: [6, 7],
      isActing: true
    })
  })

  it('maps allies who have picked, and does not flag them as acting', () => {
    const s = mapChampSelectSession(SESSION)!
    const jungler = s.allies[1]
    expect(jungler.championId).toBe(31)
    expect(jungler.assignedPosition).toBe('jungle')
    expect(jungler.summonerSpellIds).toEqual([4, 11])
    expect(jungler.isActing).toBe(false)
    expect(jungler.isLocalPlayer).toBe(false)
  })

  it('keeps the enemy team hidden (no champion, no name) before reveal', () => {
    const s = mapChampSelectSession(SESSION)!
    expect(s.enemies).toHaveLength(2)
    expect(s.enemies.every((e) => e.team === 'enemy')).toBe(true)
    expect(s.enemies.every((e) => e.championId === 0 && e.gameName === '')).toBe(true)
  })

  it('starts build/matchup/runes null (filled by the service later)', () => {
    const s = mapChampSelectSession(SESSION)!
    expect(s.localRunes).toBeNull()
    expect(s.build).toBeNull()
    expect(s.matchup).toBeNull()
  })

  it('maps bans for both teams and drops empty slots', () => {
    const withBans = {
      ...SESSION,
      bans: { myTeamBans: [157, 0, 22], theirTeamBans: [238], numBans: 4 }
    }
    const s = mapChampSelectSession(withBans)!
    expect(s.bans).toEqual([
      { championId: 157, team: 'ally' },
      { championId: 22, team: 'ally' },
      { championId: 238, team: 'enemy' }
    ])
  })

  it('returns null for a non-session payload (e.g. a Delete event)', () => {
    expect(mapChampSelectSession(null)).toBeNull()
    expect(mapChampSelectSession('nope')).toBeNull()
    expect(mapChampSelectSession({})).toBeNull()
    expect(mapChampSelectSession({ myTeam: 'not-an-array' })).toBeNull()
  })
})

describe('localPlayer / inferEnemyLaner', () => {
  it('finds the local player', () => {
    const s = mapChampSelectSession(SESSION)!
    expect(localPlayer(s)?.cellId).toBe(0)
  })

  it('returns null for the enemy laner while enemy roles are hidden', () => {
    const s = mapChampSelectSession(SESSION)!
    expect(inferEnemyLaner(s)).toBeNull() // enemy assignedPosition is '' (hidden)
  })

  it('matches the enemy laner once roles are revealed', () => {
    const revealed = {
      ...SESSION,
      theirTeam: [
        { cellId: 5, championId: 238, assignedPosition: 'middle', gameName: 'Zed', tagLine: 'EUW', spell1Id: 4, spell2Id: 14 },
        { cellId: 6, championId: 64, assignedPosition: 'jungle', gameName: '', tagLine: '', spell1Id: 4, spell2Id: 11 }
      ]
    }
    const s = mapChampSelectSession(revealed)!
    const laner = inferEnemyLaner(s) // local player is 'middle'
    expect(laner?.cellId).toBe(5)
    expect(laner?.championId).toBe(238)
  })
})
