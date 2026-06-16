import { describe, it, expect } from 'vitest'
import { extractCore, extractMatchup } from '../../src/main/domain/report/matchReportCore'
import { loadMatch, PLAYER_PUUID } from '../fixtures/load'

describe('extractCore', () => {
  it('computes the headline economy line for the player', () => {
    const core = extractCore(loadMatch('WIN_001'), PLAYER_PUUID)
    expect(core.champion).toBe('Ahri')
    expect(core.role).toBe('Mid')
    expect(core.win).toBe(true)
    expect(core.kills).toBe(9)
    expect(core.deaths).toBe(2) // two player deaths in the fixture
    // KDA ratio = (9 + 7) / 2 = 8.0
    expect(core.kdaRatio).toBe(8)
    expect(core.durationSec).toBe(1920)
    expect(core.csPerMin).toBeGreaterThan(0)
    expect(core.goldPerMin).toBeGreaterThan(0)
    expect(core.queue).toBe(420)
  })

  it('guards divide-by-zero on deaths', () => {
    const core = extractCore(loadMatch('WIN_001'), 'NOT_A_PLAYER')
    expect(core.kdaRatio).toBe(0)
    expect(core.champion).toBe('Unknown')
  })
})

describe('extractMatchup', () => {
  it('resolves the lane opponent for a mid game and orders both teams', () => {
    const mu = extractMatchup(loadMatch('WIN_001'), PLAYER_PUUID, new Map())
    expect(mu.you.isYou).toBe(true)
    expect(mu.you.role).toBe('Mid')
    expect(mu.allies).toHaveLength(5)
    expect(mu.enemies).toHaveLength(5)
    expect(mu.allies.map((a) => a.role)).toEqual(['Top', 'Jungle', 'Mid', 'Bot', 'Support'])
    expect(mu.laneOpponent).not.toBeNull()
    expect(mu.laneOpponent?.role).toBe('Mid')
    expect(mu.laneOpponent?.champion).toBe('Zed')
    expect(mu.enemies.filter((e) => e.isLaneOpponent)).toHaveLength(1)
  })

  it('carries per-player KDA, CS and gold for every roster entry', () => {
    const mu = extractMatchup(loadMatch('WIN_001'), PLAYER_PUUID, new Map())
    const you = mu.allies.find((a) => a.isYou)!
    expect(you.kills).toBe(9)
    expect(you.deaths).toBe(2)
    expect(you.assists).toBe(7)
    expect(you.cs).toBeGreaterThan(0)
    expect(you.gold).toBeGreaterThan(0)
    // every player on both teams has a populated line
    for (const e of [...mu.allies, ...mu.enemies]) {
      expect(e.cs).toBeGreaterThan(0)
      expect(e.gold).toBeGreaterThan(0)
    }
  })

  it('returns no fixed lane opponent for a jungle player', () => {
    const mu = extractMatchup(loadMatch('JUNGLE_004'), PLAYER_PUUID, new Map())
    expect(mu.you.role).toBe('Jungle')
    expect(mu.laneOpponent).toBeNull()
    expect(mu.enemies.every((e) => !e.isLaneOpponent)).toBe(true)
  })

  it('carries each player\'s loadout: spells, runes, 6 item slots and trinket', () => {
    const mu = extractMatchup(loadMatch('WIN_001'), PLAYER_PUUID, new Map())
    const you = mu.you
    expect(you.summonerSpellIds).toEqual([4, 12]) // Flash + Teleport
    expect(you.keystoneId).toBe(8112) // Electrocute
    expect(you.primaryStyleId).toBe(8100) // Domination
    expect(you.subStyleId).toBe(8300) // Inspiration
    expect(you.itemIds).toHaveLength(6)
    expect(you.itemIds.every((id) => id > 0)).toBe(true) // full build
    expect(you.trinketId).toBe(3340)
    expect(you.champLevel).toBe(18)
    expect(you.damageToChampions).toBeGreaterThan(0)
    expect(you.riotId).toBe('Corky')
    // every roster entry has exactly 6 item slots and two spell ids
    for (const e of [...mu.allies, ...mu.enemies]) {
      expect(e.itemIds).toHaveLength(6)
      expect(e.summonerSpellIds).toHaveLength(2)
      expect(e.champLevel).toBeGreaterThan(0)
    }
  })

  it('resolves item ids to named Item objects via the catalog (Unknown when absent)', () => {
    const bare = extractMatchup(loadMatch('WIN_001'), PLAYER_PUUID, new Map())
    // every slot becomes an {id,name} Item, aligned 1:1 with the raw ids
    expect(bare.you.items.map((i) => i.id)).toEqual(bare.you.itemIds)
    expect(bare.you.trinket.id).toBe(bare.you.trinketId)
    // an empty catalog never drops a slot — it labels it Unknown
    expect(bare.you.items.every((i) => i.name === 'Unknown')).toBe(true)

    // a populated catalog resolves the names it knows
    const names = new Map<number, string>(bare.you.itemIds.map((id) => [id, `Item ${id}`]))
    const named = extractMatchup(loadMatch('WIN_001'), PLAYER_PUUID, names)
    expect(named.you.items.map((i) => i.name)).toEqual(bare.you.itemIds.map((id) => `Item ${id}`))
  })

  it('keeps unfilled item slots as 0 rather than dropping them', () => {
    const mu = extractMatchup(loadMatch('SHORT_003'), PLAYER_PUUID, new Map())
    // a short game ends on a partial build — trailing slots stay empty
    expect(mu.you.itemIds.filter((id) => id > 0).length).toBeLessThan(6)
    expect(mu.you.itemIds).toHaveLength(6)
  })

  it('extracts per-team objective tallies for the scoreboard header', () => {
    const mu = extractMatchup(loadMatch('WIN_001'), PLAYER_PUUID, new Map())
    expect(mu.allyObjectives).toEqual({ towers: 9, dragons: 3, barons: 1 })
    expect(mu.enemyObjectives).toEqual({ towers: 2, dragons: 1, barons: 0 })
  })

  it('defaults loadout fields safely when the raw JSON lacks them', () => {
    const stripped = {
      info: {
        participants: [
          { participantId: 1, puuid: PLAYER_PUUID, teamId: 100, teamPosition: 'MIDDLE', championName: 'Ahri' },
          { participantId: 6, teamId: 200, teamPosition: 'MIDDLE', championName: 'Zed' }
        ]
      }
    }
    const mu = extractMatchup(stripped, PLAYER_PUUID, new Map())
    expect(mu.you.itemIds).toEqual([0, 0, 0, 0, 0, 0])
    expect(mu.you.trinketId).toBe(0)
    expect(mu.you.summonerSpellIds).toEqual([0, 0])
    expect(mu.you.keystoneId).toBeNull()
    expect(mu.you.primaryStyleId).toBeNull()
    expect(mu.you.subStyleId).toBeNull()
    expect(mu.you.champLevel).toBe(0)
    expect(mu.you.riotId).toBe('')
    expect(mu.allyObjectives).toBeNull()
    expect(mu.enemyObjectives).toBeNull()
  })
})
