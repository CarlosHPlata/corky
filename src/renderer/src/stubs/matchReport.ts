// Frontend-first stub data (Constitution VIII). Shapes mirror the `MatchReport`
// DTO in `@shared/types` exactly, so wiring the backend is a one-line swap in
// `useMatchReport`. Covers win / loss / no-timeline / zero-deaths states.
import type { Item, MatchReport, RosterEntry } from '@shared/types'

// Per-champion loadout (spells, keystone + trees, full build, trinket) so the
// scoreboard stub shows the same shape the extractor produces from raw match-v5.
interface StubLoadout {
  summs: number[]
  key: number
  pri: number
  sub: number
  items: number[]
  trinket: number
  name: string
}

const LOADOUTS: Record<string, StubLoadout> = {
  Garen:    { summs: [4, 12], key: 8010, pri: 8000, sub: 8400, items: [6631, 3047, 3053, 3742, 3065, 3156], trinket: 3340, name: 'DemaciaNow' },
  LeeSin:   { summs: [4, 11], key: 8010, pri: 8000, sub: 8100, items: [6692, 3047, 3071, 6610, 3053, 0],    trinket: 3364, name: 'BlindMonk' },
  Ahri:     { summs: [4, 12], key: 8112, pri: 8100, sub: 8300, items: [6655, 3020, 4645, 3089, 3157, 4628], trinket: 3340, name: 'Corky' },
  Jinx:     { summs: [4, 7],  key: 8008, pri: 8000, sub: 8100, items: [6672, 3006, 3031, 3085, 3036, 0],    trinket: 3363, name: 'PowPow' },
  Thresh:   { summs: [4, 14], key: 8439, pri: 8400, sub: 8300, items: [3190, 3117, 3109, 3050, 2055, 0],    trinket: 3364, name: 'LanternBot' },
  Sett:     { summs: [4, 12], key: 8010, pri: 8000, sub: 8400, items: [3078, 3047, 3053, 3742, 0, 0],       trinket: 3340, name: 'TheBoss' },
  Vi:       { summs: [4, 11], key: 8010, pri: 8000, sub: 8300, items: [6692, 3047, 3071, 3053, 3026, 0],    trinket: 3364, name: 'PiltoverFist' },
  Zed:      { summs: [4, 14], key: 8112, pri: 8100, sub: 8000, items: [6692, 3158, 3142, 3814, 6694, 6676], trinket: 3340, name: 'ShadowMaster' },
  Caitlyn:  { summs: [4, 7],  key: 8021, pri: 8000, sub: 8200, items: [6676, 3006, 3031, 3036, 3094, 0],    trinket: 3363, name: 'OnTheCase' },
  Lux:      { summs: [4, 14], key: 8229, pri: 8200, sub: 8300, items: [6655, 3020, 4628, 3157, 2055, 0],    trinket: 3364, name: 'FinalSpark' },
  Ornn:     { summs: [4, 12], key: 8437, pri: 8400, sub: 8300, items: [3068, 3047, 3075, 4401, 3065, 0],    trinket: 3340, name: 'ForgeFire' },
  "Kai'Sa": { summs: [4, 7],  key: 9923, pri: 8100, sub: 8000, items: [6672, 3006, 3124, 3031, 3036, 0],    trinket: 3363, name: 'DaughterOfVoid' },
  Nautilus: { summs: [4, 14], key: 8439, pri: 8400, sub: 8300, items: [3190, 3117, 3109, 3050, 2055, 0],    trinket: 3364, name: 'TitanAnchor' },
  Camille:  { summs: [4, 12], key: 8010, pri: 8000, sub: 8400, items: [3078, 3047, 3074, 3053, 3026, 0],    trinket: 3340, name: 'SteelShadow' },
  Graves:   { summs: [4, 11], key: 8021, pri: 8000, sub: 8100, items: [6676, 3047, 3036, 3031, 3814, 0],    trinket: 3364, name: 'CigarSmoke' },
  Syndra:   { summs: [4, 12], key: 8369, pri: 8300, sub: 8200, items: [6655, 3020, 4645, 3089, 3157, 0],    trinket: 3340, name: 'DarkSovereign' },
  Jhin:     { summs: [4, 7],  key: 8128, pri: 8100, sub: 8200, items: [6676, 3009, 3094, 3036, 3031, 0],    trinket: 3363, name: 'FourShots' },
  Leona:    { summs: [4, 14], key: 8439, pri: 8400, sub: 8300, items: [3190, 3047, 3109, 3050, 2055, 0],    trinket: 3364, name: 'SolarFlare' }
}

const NO_LOADOUT: StubLoadout = { summs: [4, 4], key: 8010, pri: 8000, sub: 8100, items: [0, 0, 0, 0, 0, 0], trinket: 3340, name: 'Summoner' }

// The stub has no Data Dragon catalog, so it labels each slot with its id —
// enough for the scoreboard shape; real names arrive once the backend resolves
// items in extractMatchup.
function item(id: number): Item {
  return { id, name: id ? `Item ${id}` : '' }
}

function loadout(champion: string, isYou: boolean): Pick<RosterEntry,
  'riotId' | 'summonerSpellIds' | 'keystoneId' | 'primaryStyleId' | 'subStyleId' | 'itemIds' | 'trinketId' | 'items' | 'trinket'
> {
  const lo = LOADOUTS[champion] ?? NO_LOADOUT
  return {
    riotId: isYou ? 'Corky' : lo.name,
    summonerSpellIds: lo.summs,
    keystoneId: lo.key,
    primaryStyleId: lo.pri,
    subStyleId: lo.sub,
    itemIds: [...lo.items],
    trinketId: lo.trinket,
    items: lo.items.map(item),
    trinket: item(lo.trinket)
  }
}

function roster(
  champs: string[],
  teamId: number,
  youRole?: string,
  laneRole?: string
): RosterEntry[] {
  const roles = ['Top', 'Jungle', 'Mid', 'Bot', 'Support']
  return champs.map((champion, i) => {
    const kills = 3 + ((i * 2 + teamId) % 8)
    const assists = 4 + ((i * 3) % 9)
    return {
      champion,
      role: roles[i],
      teamId,
      isYou: roles[i] === youRole,
      isLaneOpponent: roles[i] === laneRole,
      kills,
      deaths: 2 + ((i + teamId) % 5),
      assists,
      cs: 150 + i * 18 + (teamId === 100 ? 12 : 0),
      gold: 9000 + i * 700 + (teamId === 100 ? 600 : 0),
      champLevel: 13 + ((i * 2 + teamId) % 6),
      damageToChampions: (roles[i] === 'Support' ? 7000 : 12000) + (kills + assists) * 850 + i * 900,
      ...loadout(champion, roles[i] === youRole)
    }
  })
}

// A 31-minute team gold-diff curve in raw gold (renderer scales to k).
const LOSS_CURVE = [
  0, 300, 600, 1000, 1300, 1600, 2000, 2300, 2500, 2200, 2700, 3100, 2500, 1400, 600,
  -500, -1300, -2000, -2700, -2100, -3300, -4000, -3100, -4600, -5300, -4500, -5900,
  -6500, -7100, -6300, -7600, -8200
]

export const STUB_REPORT_LOSS: MatchReport = {
  matchId: 'EUW1_STUB_001',
  core: {
    champion: 'Ahri', role: 'Mid', win: false,
    kills: 6, deaths: 7, assists: 9, kdaRatio: 2.1,
    cs: 214, csPerMin: 6.9, gold: 13200, goldPerMin: 420,
    durationSec: 1884, queue: 420
  },
  matchup: {
    you: { champion: 'Ahri', role: 'Mid', teamId: 100, isYou: true, isLaneOpponent: false, kills: 6, deaths: 7, assists: 9, cs: 214, gold: 13200, champLevel: 16, damageToChampions: 24800, ...loadout('Ahri', true) },
    laneOpponent: { champion: 'Zed', role: 'Mid', teamId: 200, isYou: false, isLaneOpponent: true, kills: 9, deaths: 4, assists: 6, cs: 231, gold: 14100, champLevel: 17, damageToChampions: 29500, ...loadout('Zed', false) },
    allies: roster(['Garen', 'LeeSin', 'Ahri', 'Jinx', 'Thresh'], 100, 'Mid'),
    enemies: roster(['Sett', 'Vi', 'Zed', 'Caitlyn', 'Lux'], 200, undefined, 'Mid'),
    allyObjectives: { towers: 3, dragons: 2, barons: 0 },
    enemyObjectives: { towers: 9, dragons: 2, barons: 1 }
  },
  breakdown: {
    csAt10: 74, csPerMin: 6.9, goldAt14: 1400, goldAt24: -2100,
    visionScore: 18, soloDeaths: 2, killParticipation: 0.58
  },
  timeline: {
    endMin: 31,
    frames: LOSS_CURVE.map((goldDiff, i) => ({ tMin: i, goldDiff })),
    highlights: [
      { tMin: 6.5, kind: 'objective', label: 'Cloud drake — Blue', detail: 'Your team took the first drake.', side: 'ally' },
      { tMin: 16.5, kind: 'objective', label: 'Rift Herald — Blue', detail: 'Herald into two mid plates.', side: 'ally' },
      { tMin: 24.7, kind: 'teamfight', label: 'Team wiped 1–4', detail: '4 deaths in 12s contesting Baron.', side: 'enemy' },
      { tMin: 22.2, kind: 'death', label: 'Death → −1.6k', detail: 'Died alone in the river; gold swung over the next minute.', side: 'enemy' },
      { tMin: 24.4, kind: 'objective', label: 'Baron — Red', detail: 'Enemy secured Baron.', side: 'enemy' }
    ]
  },
  deathMap: {
    count: 3,
    deaths: [
      { n: 1, tMin: 8.6, xPct: 50, yPct: 52 },
      { n: 2, tMin: 22.1, xPct: 32, yPct: 66 },
      { n: 3, tMin: 27.6, xPct: 70, yPct: 60 }
    ]
  },
  timelineAvailable: true
}

const WIN_CURVE = [
  0, 200, 500, 900, 1300, 1800, 2300, 2000, 2600, 3400, 3000, 3600, 4100, 4500, 4200,
  4800, 5300, 5000, 5600, 6200, 5800, 6500, 7000, 6600, 8200, 8800, 9400, 9000, 9600
]

export const STUB_REPORT_WIN: MatchReport = {
  matchId: 'EUW1_STUB_002',
  core: {
    champion: 'Ahri', role: 'Mid', win: true,
    kills: 11, deaths: 3, assists: 7, kdaRatio: 6.0,
    cs: 248, csPerMin: 8.1, gold: 14800, goldPerMin: 513,
    durationSec: 1730, queue: 420
  },
  matchup: {
    you: { champion: 'Ahri', role: 'Mid', teamId: 100, isYou: true, isLaneOpponent: false, kills: 11, deaths: 3, assists: 7, cs: 248, gold: 14800, champLevel: 18, damageToChampions: 31400, ...loadout('Ahri', true) },
    laneOpponent: { champion: 'Syndra', role: 'Mid', teamId: 200, isYou: false, isLaneOpponent: true, kills: 4, deaths: 8, assists: 5, cs: 215, gold: 11900, champLevel: 15, damageToChampions: 19300, ...loadout('Syndra', false) },
    allies: roster(['Ornn', 'Vi', 'Ahri', "Kai'Sa", 'Nautilus'], 100, 'Mid'),
    enemies: roster(['Camille', 'Graves', 'Syndra', 'Jhin', 'Leona'], 200, undefined, 'Mid'),
    allyObjectives: { towers: 8, dragons: 3, barons: 1 },
    enemyObjectives: { towers: 2, dragons: 1, barons: 0 }
  },
  breakdown: {
    csAt10: 78, csPerMin: 8.1, goldAt14: 2100, goldAt24: 3200,
    visionScore: 32, soloDeaths: 0, killParticipation: 0.64
  },
  timeline: {
    endMin: 28,
    frames: WIN_CURVE.map((goldDiff, i) => ({ tMin: i, goldDiff })),
    highlights: [
      { tMin: 11, kind: 'objective', label: 'Infernal drake — Blue', detail: 'Pathed bot off the reset.', side: 'ally' },
      { tMin: 18, kind: 'teamfight', label: 'Team wiped 4–1', detail: '4 enemy deaths in 10s mid.', side: 'ally' },
      { tMin: 26, kind: 'objective', label: 'Baron — Blue', detail: 'Free Baron off the ace.', side: 'ally' }
    ]
  },
  deathMap: {
    count: 2,
    deaths: [
      { n: 1, tMin: 12.3, xPct: 50, yPct: 48 },
      { n: 2, tMin: 24.1, xPct: 64, yPct: 66 }
    ]
  },
  timelineAvailable: true
}

/** A game whose timeline JSON wasn't stored — the report degrades cleanly. */
export const STUB_REPORT_NO_TIMELINE: MatchReport = {
  ...STUB_REPORT_WIN,
  matchId: 'EUW1_STUB_003',
  breakdown: { ...STUB_REPORT_WIN.breakdown, csAt10: null, goldAt14: null, goldAt24: null },
  timeline: null,
  deathMap: null,
  timelineAvailable: false
}

/** Resolve a stub report by id, defaulting by win for unknown ids (US1 demo). */
export function stubMatchReport(matchId: string): MatchReport {
  if (matchId === STUB_REPORT_WIN.matchId) return { ...STUB_REPORT_WIN, matchId }
  if (matchId === STUB_REPORT_NO_TIMELINE.matchId) return { ...STUB_REPORT_NO_TIMELINE, matchId }
  return { ...STUB_REPORT_LOSS, matchId }
}
