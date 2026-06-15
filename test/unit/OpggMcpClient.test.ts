import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { OpggMcpClient, mapLaneMeta, mapChampionAnalysis, mapChampionBuildInsight, type RawToolCall } from '../../src/main/adapters/driven/opgg/OpggMcpClient'

// Verbatim live response shape (2026-06 contract: dotted desired_output_fields).
const CLASS_NOTATION_FIXTURE = `class LolGetChampionAnalysis: data
class Data: summary,runes,core_items,boots,starter_items,summoner_spells,skill_masteries
class Summary: average_stats
class AverageStats: win_rate,pick_rate
class Runes: primary_page_name,primary_rune_names,secondary_page_name
class CoreItems: ids_names
class SkillMasteries: ids

LolGetChampionAnalysis(Data(Summary(AverageStats(0.51,0.07)),Runes("Domination",["Hail of Blades","Sudden Impact","Grisly Mementos","Relentless Hunter"],"Sorcery"),CoreItems(["Dusk and Dawn","Shadowflame","Rabadon's Deathcap"]),CoreItems(["Sorcerer's Shoes"]),CoreItems(["Doran's Ring","Health Potion","Health Potion"]),CoreItems([4,14]),SkillMasteries(["Q","E","W"])))`

const laneFixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/opgg-lane-meta.sample.json'), 'utf8')
)

describe('mapLaneMeta', () => {
  it('maps the assumed OP.GG shape and normalizes percentage rates to 0..1', () => {
    const mapped = mapLaneMeta(laneFixture)
    expect(mapped).not.toBeNull()
    const ahri = mapped!.find((c) => c.champion === 'Ahri')!
    expect(ahri.position).toBe('MID')
    expect(ahri.winRate).toBeCloseTo(0.512)
    expect(ahri.tier).toBe('2')
    expect(ahri.csPerMin).toBe(7.4)
    expect(ahri.patch).toBe('26.11')
  })

  it('returns null for an unrecognizable payload', () => {
    expect(mapLaneMeta({ nope: true })).toBeNull()
    expect(mapLaneMeta(null)).toBeNull()
  })

  it('keeps already-normalized (0..1) rates as-is', () => {
    const mapped = mapLaneMeta([{ champion: 'X', position: 'TOP', win_rate: 0.48 }])
    expect(mapped![0].winRate).toBeCloseTo(0.48)
  })
})

describe('mapChampionAnalysis', () => {
  it('maps a champion-analysis object', () => {
    const a = mapChampionAnalysis({ win_rate: 50, pick_rate: 9, patch: '26.11' }, 'Ahri', 'MID')
    expect(a?.winRate).toBeCloseTo(0.5)
    expect(a?.champion).toBe('Ahri')
  })
  it('returns null without a win rate', () => {
    expect(mapChampionAnalysis({ foo: 1 }, 'Ahri', 'MID')).toBeNull()
  })

  it('parses live class-notation text — AverageStats(win_rate, pick_rate)', () => {
    const a = mapChampionAnalysis(CLASS_NOTATION_FIXTURE, 'Ekko', 'MID')
    expect(a?.winRate).toBeCloseTo(0.51)
    expect(a?.pickRate).toBeCloseTo(0.07)
  })
})

describe('mapChampionBuildInsight (class notation)', () => {
  it('parses runes, the four item blocks in order, spells and skill order', () => {
    const b = mapChampionBuildInsight(CLASS_NOTATION_FIXTURE, 'Ekko', 'MID')
    expect(b).not.toBeNull()
    expect(b!.keystone).toBe('Hail of Blades')
    expect(b!.primaryTree).toBe('Domination')
    expect(b!.secondaryTree).toBe('Sorcery')
    expect(b!.coreItems).toEqual(['Dusk and Dawn', 'Shadowflame', "Rabadon's Deathcap", "Sorcerer's Shoes"])
    expect(b!.startItems).toEqual(["Doran's Ring", 'Health Potion', 'Health Potion'])
    expect(b!.summonerSpells).toEqual(['Flash', 'Ignite'])
    expect(b!.skillOrder).toBe('Q > E > W')
  })
})

describe('OpggMcpClient', () => {
  it('maps a successful raw call into typed lane meta', async () => {
    const raw: RawToolCall = vi.fn().mockResolvedValue(laneFixture)
    const client = new OpggMcpClient(raw)
    const lane = await client.getLaneMeta()
    expect(lane).toHaveLength(2)
    expect(raw).toHaveBeenCalledWith('lol_list_lane_meta_champions', expect.any(Object))
  })

  it('resolves to null (never throws) when the raw call fails', async () => {
    const raw: RawToolCall = vi.fn().mockRejectedValue(new Error('timeout'))
    const client = new OpggMcpClient(raw)
    await expect(client.getLaneMeta()).resolves.toBeNull()
  })

  it('serves repeated identical calls from cache (raw call invoked once)', async () => {
    const raw: RawToolCall = vi.fn().mockResolvedValue(laneFixture)
    const client = new OpggMcpClient(raw)
    await client.getLaneMeta()
    await client.getLaneMeta()
    expect(raw).toHaveBeenCalledTimes(1)
  })

  it('does NOT cache failures — a null raw result is retried on the next call', async () => {
    const raw: RawToolCall = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(laneFixture)
    const client = new OpggMcpClient(raw)
    await expect(client.getLaneMeta()).resolves.toBeNull()
    await expect(client.getLaneMeta()).resolves.not.toBeNull()
    expect(raw).toHaveBeenCalledTimes(2)
  })

  it('reports every MCP tool call on the event bus — miss then hit, with a raw preview', async () => {
    const { eventBus } = await import('../../src/main/application/events/EventBus')
    const events: { cache?: string; method?: string; ok?: boolean; preview?: string }[] = []
    const collect = (e: object): void => void events.push(e)
    eventBus.on('telemetry.outbound', collect)
    try {
      const raw: RawToolCall = vi.fn().mockResolvedValue(laneFixture)
      const client = new OpggMcpClient(raw)
      await client.getLaneMeta()
      await client.getLaneMeta()
    } finally {
      eventBus.off('telemetry.outbound', collect)
    }
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ method: 'lol_list_lane_meta_champions', cache: 'miss', ok: true })
    expect(events[0].preview).toBeTruthy()
    expect(events[1]).toMatchObject({ cache: 'hit', ok: true })
  })
})
