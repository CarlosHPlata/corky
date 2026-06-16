import { describe, it, expect } from 'vitest'
import { buildCoachBriefing } from '../../src/main/domain/report/coachBriefing'
import type { MatchReport, MatchAnalysis, MatchCore, Matchup, Item } from '../../src/shared/types'

const core: MatchCore = {
  champion: 'Ahri', role: 'Mid', win: false,
  kills: 4, deaths: 6, assists: 7, kdaRatio: 1.83,
  cs: 201, csPerMin: 6.4, gold: 11200, goldPerMin: 360,
  durationSec: 1884, queue: 420
}

// Item names are resolved upstream (assembleMatchReport → extractMatchup) into
// RosterEntry.items/trinket; the briefing just reads those names. Entries we
// don't assert item lines for carry empty slots.
const NO_ITEMS: Item[] = []
const NO_TRINKET: Item = { id: 0, name: '' }
const YOUR_ITEMS: Item[] = [
  { id: 3040, name: "Seraph's Embrace" },
  { id: 3135, name: 'Void Staff' },
  { id: 3020, name: "Sorcerer's Shoes" },
  { id: 3116, name: "Rylai's Crystal Scepter" },
  { id: 3157, name: "Zhonya's Hourglass" },
  { id: 3030, name: 'Hextech Rocketbelt' }
]
const YOUR_TRINKET: Item = { id: 3340, name: 'Stealth Ward' }

const matchup: Matchup = {
  you: { champion: 'Ahri', role: 'Mid', teamId: 100, isYou: true, isLaneOpponent: false, kills: 4, deaths: 6, assists: 7, cs: 201, gold: 11200, champLevel: 16, damageToChampions: 22000, riotId: 'player', summonerSpellIds: [4, 14], keystoneId: 8214, primaryStyleId: 8200, subStyleId: 8000, itemIds: [3040, 3135, 3020, 3116, 3157, 3030], trinketId: 3340, items: YOUR_ITEMS, trinket: YOUR_TRINKET },
  laneOpponent: { champion: 'Zed', role: 'Mid', teamId: 200, isYou: false, isLaneOpponent: true, kills: 8, deaths: 3, assists: 5, cs: 220, gold: 13100, champLevel: 17, damageToChampions: 28000, riotId: 'opp', summonerSpellIds: [4, 12], keystoneId: 8128, primaryStyleId: 8100, subStyleId: 8300, itemIds: [3142, 3147, 3071, 3814, 3158, 0], trinketId: 3340, items: NO_ITEMS, trinket: NO_TRINKET },
  allies: [
    { champion: 'Garen', role: 'Top', teamId: 100, isYou: false, isLaneOpponent: false, kills: 2, deaths: 4, assists: 5, cs: 180, gold: 9000, champLevel: 14, damageToChampions: 15000, riotId: 'a', summonerSpellIds: [4, 14], keystoneId: null, primaryStyleId: null, subStyleId: null, itemIds: [3026, 3742, 0, 0, 0, 0], trinketId: 0, items: NO_ITEMS, trinket: NO_TRINKET },
    { champion: 'Ahri', role: 'Mid', teamId: 100, isYou: true, isLaneOpponent: false, kills: 4, deaths: 6, assists: 7, cs: 201, gold: 11200, champLevel: 16, damageToChampions: 22000, riotId: 'player', summonerSpellIds: [4, 14], keystoneId: 8214, primaryStyleId: 8200, subStyleId: 8000, itemIds: [3040, 3135, 3020, 3116, 3157, 3030], trinketId: 3340, items: YOUR_ITEMS, trinket: YOUR_TRINKET }
  ],
  enemies: [
    { champion: 'Zed', role: 'Mid', teamId: 200, isYou: false, isLaneOpponent: true, kills: 8, deaths: 3, assists: 5, cs: 220, gold: 13100, champLevel: 17, damageToChampions: 28000, riotId: 'opp', summonerSpellIds: [4, 12], keystoneId: 8128, primaryStyleId: 8100, subStyleId: 8300, itemIds: [3142, 3147, 3071, 3814, 3158, 0], trinketId: 3340, items: NO_ITEMS, trinket: NO_TRINKET }
  ],
  allyObjectives: { towers: 3, dragons: 1, barons: 0 },
  enemyObjectives: { towers: 7, dragons: 3, barons: 1 }
}

const report = { core, matchup } as MatchReport

const analysis: MatchAnalysis = {
  matchId: 'M1', result: 'loss',
  framing: null,
  narration: {
    highlightNarrations: [],
    deathNarrations: [{ ref: { id: 'marker:death#2', kind: 'marker' }, character: 'caught_out', text: 'Alone in the river before Baron.' }],
    turningPoints: [{ time: '22:10', swing: '−1.6k swing', dir: 'down', you: { x: 24, y: 30 }, event: { x: 62, y: 60 }, what: 'Solo death handed them Herald.', better: 'Recall on the lead.' }]
  },
  review: {
    verdict: { lead: 'Even until 24, then you threw it.', gild: 'Two river deaths.' },
    improve: 'Group by 24:00.',
    claims: [], cohort: 'vs general benchmark', benchmarkBasis: 'general', confidence: 'established'
  },
  tasks: {
    standing: [{ id: 't1', description: "Don't die alone in the river.", metric: 'solo_deaths', comparator: '==', target: 0, scope: 'universal', status: 'active', sourceMatchId: 'M1' }],
    sinceLast: [], firstTime: true
  },
  status: 'done',
  sections: { framing: 'skipped', narration: 'done', review: 'done', tasks: 'done' },
  lightModel: 'l', heavyModel: 'h', generatedAt: 0
}

describe('buildCoachBriefing', () => {
  it('grounds the brief in this game: scoreline, verdict, deaths, swings, tasks, goal', () => {
    const out = buildCoachBriefing(report, analysis, 'Climb to Platinum')
    expect(out).toContain('Ahri (Mid)')
    expect(out).toContain('31:24') // durationSec formatted
    expect(out).toContain('DEFEAT')
    expect(out).toContain('4/6/7')
    expect(out).toContain("Corky's verdict: Even until 24")
    expect(out).toContain('Group by 24:00')
    expect(out).toContain('caught out — Alone in the river')
    expect(out).toContain('22:10')
    expect(out).toContain("Don't die alone in the river.")
    expect(out).toContain('Climb to Platinum')
  })

  it('includes team matchup, build and runes in the brief — loadout as words', () => {
    const out = buildCoachBriefing(report, analysis, undefined)
    // Lane opponent
    expect(out).toContain('Lane opponent: Zed')
    expect(out).toContain('8/3/5')
    // Team compositions
    expect(out).toContain('Ahri/Mid[YOU]')
    expect(out).toContain('Zed/Mid[OPP]')
    expect(out).toContain('Garen/Top')
    // Loadout, all in words — the names resolved into the report, never raw ids
    expect(out).toContain('Your summoner spells: Flash + Ignite')
    expect(out).toContain("Your items: Seraph's Embrace, Void Staff, Sorcerer's Shoes, Rylai's Crystal Scepter, Zhonya's Hourglass, Hextech Rocketbelt · trinket: Stealth Ward")
    expect(out).toContain('Your runes: keystone Summon Aery, Sorcery primary, Precision secondary')
    expect(out).not.toContain('8214')
    expect(out).not.toContain('3040')
  })

  it('degrades to hard facts when there is no analysis yet', () => {
    const out = buildCoachBriefing(report, undefined, undefined)
    expect(out).toContain('Ahri (Mid)')
    expect(out).not.toContain("Corky's verdict")
    expect(out).not.toContain('Standing focus tasks')
  })
})
