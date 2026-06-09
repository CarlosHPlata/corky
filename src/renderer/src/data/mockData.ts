export const SUMMONER = {
  name: 'CarlosHP',
  tag: 'EUW',
  region: 'EUW',
  rank: 'Platinum II',
  lp: 64,
  role: 'Mid',
}

export interface MatchMock {
  id: string
  champ: string
  role: string
  win: boolean
  k: number
  d: number
  a: number
  cs: number
  csmin: number
  gold?: string
  goldmin?: string
  dur: string
  queue: string
  when: string
  reason: string
  isNew?: boolean
}

export const MATCHES: MatchMock[] = [
  { id: 'EUW1_001', champ: 'Ahri', role: 'Mid', win: false, k: 6, d: 7, a: 9, cs: 214, csmin: 6.9, gold: '13.2k', goldmin: '420', dur: '31:24', queue: 'Ranked Solo', when: '14m ago', reason: 'Lost the mid-game — caught out before Baron, twice.', isNew: true },
  { id: 'EUW1_002', champ: 'Ahri', role: 'Mid', win: true, k: 11, d: 3, a: 7, cs: 248, csmin: 8.1, gold: '14.8k', goldmin: '513', dur: '28:50', queue: 'Ranked Solo', when: '2h ago', reason: 'Snowballed a lane lead into objectives. Clean close.' },
  { id: 'EUW1_003', champ: 'Syndra', role: 'Mid', win: true, k: 8, d: 4, a: 12, cs: 232, csmin: 7.4, dur: '34:10', queue: 'Ranked Solo', when: '3h ago', reason: 'Even game, won the 30-minute teamfight.' },
  { id: 'EUW1_004', champ: 'Viktor', role: 'Mid', win: false, k: 3, d: 8, a: 5, cs: 198, csmin: 5.8, dur: '36:02', queue: 'Ranked Solo', when: 'Yesterday', reason: 'Fell behind in lane and never pathed to recover.' },
  { id: 'EUW1_005', champ: 'Ahri', role: 'Mid', win: true, k: 9, d: 2, a: 10, cs: 261, csmin: 8.4, dur: '30:18', queue: 'Ranked Solo', when: 'Yesterday', reason: 'Lane lead, grouped for both early drakes.' },
  { id: 'EUW1_006', champ: 'Orianna', role: 'Mid', win: false, k: 5, d: 6, a: 8, cs: 223, csmin: 6.5, dur: '34:44', queue: 'Ranked Solo', when: 'Yesterday', reason: 'Threw a 4k lead at 25 — overextended for picks.' },
  { id: 'EUW1_007', champ: 'Syndra', role: 'Mid', win: true, k: 12, d: 5, a: 6, cs: 240, csmin: 7.7, dur: '31:09', queue: 'Ranked Solo', when: '2d ago', reason: 'Carried the mid-game, closed at 31.' },
  { id: 'EUW1_008', champ: 'Ahri', role: 'Mid', win: false, k: 4, d: 9, a: 11, cs: 205, csmin: 6.2, dur: '33:20', queue: 'Ranked Solo', when: '2d ago', reason: 'Solo deaths in the river — vision problem.' },
]

export interface FocusTaskData {
  result: 'improved' | 'held' | 'regressed' | 'not_applicable' | 'pending'
  actual?: string
  description: string
  metric: string
  comparator: string
  target: string
  scope: string
}

export interface TurningPointData {
  time: string
  swing: string
  dir: 'up' | 'down'
  you: { x: number; y: number }
  event: { x: number; y: number }
  objective?: { x: number; y: number }
  what: string
  better: string
}

export interface DeathData {
  n: number
  min: string
  type: 'caught_out' | 'overextended' | 'fair_fight' | 'outnumbered'
  where: string
  note: string
}

export interface RosterPlayer {
  role: string
  champ: string
  you?: boolean
  lane?: boolean
}

export type EventKind = 'teamfight' | 'objective' | 'death' | 'spike' | 'ace' | 'pick'

export interface TimelineEvent {
  t: number
  kind: EventKind
  label: string
  detail?: string
}

export interface StatData {
  label: string
  value: string
  delta?: string
  dir: 'up' | 'down' | 'flat'
  caption: string
  unit?: string
}

export interface ReportMock {
  matchId: string
  result: 'win' | 'loss'
  verdict: { lead: string; gild: string }
  cohort: string
  headlineTag: string
  headlineTagIntent: 'win' | 'loss' | 'objective' | 'accent' | 'warn' | 'info' | 'neutral'
  roster: { ally: RosterPlayer[]; enemy: RosterPlayer[] }
  sinceLast: FocusTaskData[]
  nextFocus: FocusTaskData[]
  stats: StatData[]
  goldCurve: number[]
  chartMarks: number[]
  chartFoot: { t: string; color?: string }[]
  teamGold: number[]
  timelineEvents: TimelineEvent[]
  deaths: DeathData[]
  turningPoints: TurningPointData[]
}

export const REPORT_LOSS: ReportMock = {
  matchId: 'EUW1_001',
  result: 'loss',
  verdict: {
    lead: 'Even game until 24 minutes.',
    gild: 'You lost it by walking into the river alone before Baron — twice.',
  },
  cohort: 'Measured against your 6 winning Ahri games this patch.',
  headlineTag: 'Baron 24:40',
  headlineTagIntent: 'objective',
  roster: {
    ally: [
      { role: 'Top', champ: 'Garen' },
      { role: 'Jungle', champ: 'Lee Sin' },
      { role: 'Mid', champ: 'Ahri', you: true },
      { role: 'Bot', champ: 'Jinx' },
      { role: 'Support', champ: 'Thresh' },
    ],
    enemy: [
      { role: 'Top', champ: 'Sett' },
      { role: 'Jungle', champ: 'Vi' },
      { role: 'Mid', champ: 'Zed', lane: true },
      { role: 'Bot', champ: 'Caitlyn' },
      { role: 'Support', champ: 'Lux' },
    ],
  },
  teamGold: [0, 0.3, 0.6, 1.0, 1.3, 1.6, 2.0, 2.3, 2.5, 2.2, 2.7, 3.1, 2.5, 1.4, 0.6, -0.5, -1.3, -2.0, -2.7, -2.1, -3.3, -4.0, -3.1, -4.6, -5.3, -4.5, -5.9, -6.5, -7.1, -6.3, -7.6, -8.2],
  timelineEvents: [
    { t: 6.5, kind: 'objective', label: 'First drake', detail: 'Your team took Cloud drake uncontested.' },
    { t: 9.0, kind: 'teamfight', label: 'Skirmish won', detail: '2-for-1 in the mid-river. Lead out to +2.5k.' },
    { t: 16.5, kind: 'objective', label: 'Rift Herald', detail: 'Herald into two mid plates. Peak lead +3.1k.' },
    { t: 22.2, kind: 'death', label: 'Caught out', detail: 'You died alone in the river — the lead starts slipping.' },
    { t: 24.7, kind: 'objective', label: 'Baron lost', detail: 'Team aced contesting Baron 4v5. −2.4k swing.' },
    { t: 27.6, kind: 'death', label: 'Caught out', detail: 'Facechecked the Baron pit solo before the fight.' },
    { t: 30.5, kind: 'teamfight', label: 'Lost teamfight', detail: 'Wiped at their base. Game over.' },
  ],
  sinceLast: [
    { result: 'improved', actual: '74', description: 'Hit 70 CS by 10 minutes.', metric: 'cs_at_10', comparator: '>=', target: '70', scope: 'role' },
    { result: 'regressed', actual: '2', description: "Don’t die alone in the river.", metric: 'solo_river_deaths', comparator: '==', target: '0', scope: 'universal' },
    { result: 'not_applicable', actual: undefined, description: 'Be present for the first two dragons.', metric: 'drakes_present', comparator: '>=', target: '2', scope: 'universal' },
  ],
  nextFocus: [
    { result: 'pending', description: "Don’t die alone in the river.", metric: 'solo_river_deaths', comparator: '==', target: '0', scope: 'universal' },
    { result: 'pending', description: 'Ward the enemy approaches before every Baron.', metric: 'vision_pre_baron', comparator: '>=', target: '2', scope: 'universal' },
    { result: 'pending', description: 'Group with your team by 24:00.', metric: 'grouped_at_24', comparator: '==', target: '1', scope: 'universal' },
  ],
  stats: [
    { label: 'CS @ 10', value: '74', delta: '+4', dir: 'up', caption: 'vs Ahri wins (70)' },
    { label: 'CS / min', value: '6.9', delta: '-1.2', dir: 'down', caption: 'vs Ahri wins (8.1)' },
    { label: 'Gold @ 14', value: '+1.4k', dir: 'up', caption: 'lane lead held' },
    { label: 'Gold @ 24', value: '−2.1k', dir: 'down', caption: 'lead thrown' },
    { label: 'Vision', value: '0.9', unit: '/min', delta: '-0.6', dir: 'down', caption: 'vs Ahri wins (1.5)' },
    { label: 'Solo deaths', value: '2', delta: '+2', dir: 'down', caption: 'river, minutes 22 & 27' },
  ],
  goldCurve: [0, 4, 9, 14, 18, 22, 20, 12, 4, -8, -18, -22, -30],
  chartMarks: [8, 9],
  chartFoot: [{ t: '0:00' }, { t: '+1.4k @ 14:00', color: 'var(--win)' }, { t: '−2.1k @ 24:00', color: 'var(--loss)' }, { t: '31:24' }],
  deaths: [
    { n: 1, min: '8:40', type: 'fair_fight', where: 'Mid lane', note: '2v2 trade gone wrong after roam.' },
    { n: 2, min: '22:10', type: 'caught_out', where: 'River', note: 'Alone, no vision, walked into the enemy jungler.' },
    { n: 3, min: '27:35', type: 'caught_out', where: 'River', note: 'Facechecked the Baron pit solo before the fight.' },
  ],
  turningPoints: [
    { time: '22:10', swing: '−1.6k swing', dir: 'down', you: { x: 24, y: 30 }, event: { x: 62, y: 60 }, what: 'First solo death in the river handed the enemy mid a reset and Rift Herald.', better: 'Recall on the lead at 21:30 — there’s nothing to do alone in the bottom river.' },
    { time: '24:40', swing: '−2.4k swing', dir: 'down', you: { x: 22, y: 26 }, event: { x: 70, y: 64 }, objective: { x: 78, y: 56 }, what: 'Your team contested Baron 4v5 and got aced. You were top, pushing a sidelane.', better: 'Give the wave and group by 24:00 — you can’t contest Baron from the opposite corner.' },
  ],
}

export const REPORT_WIN: ReportMock = {
  matchId: 'EUW1_002',
  result: 'win',
  verdict: {
    lead: 'A clean snowball.',
    gild: 'You turned a 2-level lead at 9 minutes into both early dragons and closed before they could scale.',
  },
  cohort: 'Measured against your 6 winning Ahri games this patch.',
  headlineTag: 'Closed 28:50',
  headlineTagIntent: 'win',
  roster: {
    ally: [
      { role: 'Top', champ: 'Ornn' },
      { role: 'Jungle', champ: 'Vi' },
      { role: 'Mid', champ: 'Ahri', you: true },
      { role: 'Bot', champ: "Kai'Sa" },
      { role: 'Support', champ: 'Nautilus' },
    ],
    enemy: [
      { role: 'Top', champ: 'Camille' },
      { role: 'Jungle', champ: 'Graves' },
      { role: 'Mid', champ: 'Syndra', lane: true },
      { role: 'Bot', champ: 'Jhin' },
      { role: 'Support', champ: 'Leona' },
    ],
  },
  teamGold: [0, 0.2, 0.5, 0.9, 1.3, 1.8, 2.3, 2.0, 2.6, 3.4, 3.0, 3.6, 4.1, 4.5, 4.2, 4.8, 5.3, 5.0, 5.6, 6.2, 5.8, 6.5, 7.0, 6.6, 8.2, 8.8, 9.4, 9.0, 9.6],
  timelineEvents: [
    { t: 9.2, kind: 'spike', label: 'Solo kill', detail: 'Charm → ult all-in on the enemy mid. Two-level lead.' },
    { t: 11.0, kind: 'objective', label: 'First drake', detail: 'Pathed bot off the reset for Infernal.' },
    { t: 12.3, kind: 'death', label: 'Fair trade', detail: 'Traded a kill on a clean all-in. Fine.' },
    { t: 18.0, kind: 'teamfight', label: 'Teamfight won', detail: '4-for-1 mid. Lead out to +5k.' },
    { t: 24.1, kind: 'ace', label: 'Ace at drake', detail: '3-man Charm into a clean ace. +2.4k swing.' },
    { t: 26.0, kind: 'objective', label: 'Baron', detail: 'Free Baron off the ace.' },
    { t: 28.5, kind: 'teamfight', label: 'Closing push', detail: 'Baron-empowered mid push ends it.' },
  ],
  sinceLast: [
    { result: 'improved', actual: '78', description: 'Hit 70 CS by 10 minutes.', metric: 'cs_at_10', comparator: '>=', target: '70', scope: 'role' },
    { result: 'held', actual: '0', description: "Don’t die alone in the river.", metric: 'solo_river_deaths', comparator: '==', target: '0', scope: 'universal' },
    { result: 'improved', actual: '2', description: 'Be present for the first two dragons.', metric: 'drakes_present', comparator: '>=', target: '2', scope: 'universal' },
  ],
  nextFocus: [
    { result: 'pending', description: 'Keep converting — don’t slow-push when you can close.', metric: 'avg_close_time', comparator: '<=', target: '30', scope: 'universal' },
    { result: 'pending', description: 'Take the first tower plates before roaming.', metric: 'plates_taken', comparator: '>=', target: '3', scope: 'role' },
    { result: 'pending', description: 'Stay even on vision into the mid-game.', metric: 'vision_per_min', comparator: '>=', target: '1.4', scope: 'universal' },
  ],
  stats: [
    { label: 'CS @ 10', value: '78', delta: '+8', dir: 'up', caption: 'vs Ahri wins (70)' },
    { label: 'CS / min', value: '8.4', delta: '+0.3', dir: 'up', caption: 'vs Ahri wins (8.1)' },
    { label: 'Gold @ 14', value: '+2.1k', dir: 'up', caption: 'lead pressed' },
    { label: 'Gold @ 24', value: '+3.2k', dir: 'up', caption: 'lead grew' },
    { label: 'Vision', value: '1.6', unit: '/min', delta: '+0.1', dir: 'up', caption: 'vs Ahri wins (1.5)' },
    { label: 'Solo deaths', value: '0', delta: '0', dir: 'flat', caption: 'none — held the focus task' },
  ],
  goldCurve: [0, 3, 8, 13, 18, 22, 26, 24, 28, 31, 34, 33, 32],
  chartMarks: [4, 9],
  chartFoot: [{ t: '0:00' }, { t: '+2.1k @ 14:00', color: 'var(--win)' }, { t: '+3.2k @ 24:00', color: 'var(--win)' }, { t: '28:50' }],
  deaths: [
    { n: 1, min: '12:20', type: 'fair_fight', where: 'Mid lane', note: 'Traded a kill for a kill on a clean all-in. Fine.' },
    { n: 2, min: '24:05', type: 'fair_fight', where: 'Dragon pit', note: 'Died in the winning fight — your team aced after.' },
  ],
  turningPoints: [
    { time: '9:10', swing: '+1.3k swing', dir: 'up', you: { x: 48, y: 46 }, event: { x: 52, y: 44 }, what: 'Solo-killed the enemy mid on a Charm → ult all-in, then reset on the level lead.', better: 'Exactly right — you recalled, bought, and used the tempo to path bot for first drake.' },
    { time: '24:05', swing: '+2.4k swing', dir: 'up', you: { x: 64, y: 66 }, event: { x: 66, y: 64 }, objective: { x: 72, y: 70 }, what: 'Your team forced a 5v5 at the second drake and aced — you opened with a 3-man Charm.', better: 'Good call. The only note: you could have flashed out after the ult to survive the trade.' },
  ],
}

export interface LpPoint {
  lp: number
  baseline?: boolean
  label?: string
  matchId?: string
  champ?: string
  win?: boolean
  delta?: number
  when?: string
}

export interface LpHistoryData {
  tier: string
  div: string
  lp: number
  floorLp: number
  ceilLp: number
  demoteLabel: string
  promoLabel: string
  points: LpPoint[]
}

export const LP_HISTORY: LpHistoryData = {
  tier: 'Platinum', div: 'II', lp: 64,
  floorLp: 0, ceilLp: 100,
  demoteLabel: 'Platinum III', promoLabel: 'Platinum I',
  points: [
    { lp: 57, baseline: true, label: 'Session start' },
    { matchId: 'EUW1_008', champ: 'Ahri',    win: false, lp: 38, delta: -19, when: '2d ago' },
    { matchId: 'EUW1_007', champ: 'Syndra',  win: true,  lp: 59, delta: 21,  when: '2d ago' },
    { matchId: 'EUW1_006', champ: 'Orianna', win: false, lp: 41, delta: -18, when: 'Yesterday' },
    { matchId: 'EUW1_005', champ: 'Ahri',    win: true,  lp: 63, delta: 22,  when: 'Yesterday' },
    { matchId: 'EUW1_004', champ: 'Viktor',  win: false, lp: 45, delta: -18, when: 'Yesterday' },
    { matchId: 'EUW1_003', champ: 'Syndra',  win: true,  lp: 65, delta: 20,  when: '3h ago' },
    { matchId: 'EUW1_002', champ: 'Ahri',    win: true,  lp: 84, delta: 19,  when: '2h ago' },
    { matchId: 'EUW1_001', champ: 'Ahri',    win: false, lp: 64, delta: -20, when: '14m ago' },
  ],
}

export const CHAMP_SELECT = {
  yourPick: 'Ahri',
  yourRole: 'Mid',
  ally: [
    { champ: 'Garen', role: 'Top', you: false },
    { champ: 'Lee Sin', role: 'Jungle', you: false },
    { champ: 'Ahri', role: 'Mid', you: true },
    { champ: 'Jinx', role: 'Bot', you: false },
    { champ: 'Thresh', role: 'Support', you: false },
  ],
  enemy: [
    { champ: 'Sett', role: 'Top', you: false },
    { champ: 'Vi', role: 'Jungle', you: false },
    { champ: 'Zed', role: 'Mid', you: false },
    { champ: 'Caitlyn', role: 'Bot', you: false },
    { champ: 'Lux', role: 'Support', you: false },
  ],
  matchup: {
    vs: 'Zed',
    summary: 'Skill matchup. Zed has all-in pressure at 6 with ult — he wants to delete you, not poke. Respect level 6.',
    favor: 'even',
  },
  threats: [
    { champ: 'Zed', text: 'All-in at 6. Hold Charm for his ult re-appear, not his shadow.' },
    { champ: 'Vi', text: "Point-and-click R. Buy early boots; don’t face her flank sided." },
  ],
  winCondition: "You scale and roam better than Zed. Survive lane, get your jungler ahead, and pick off their squishy backline in the mid-game.",
  build: {
    runes: 'Electrocute · Sudden Impact · Eyeball · Treasure Hunter',
    summoners: 'Flash · Teleport',
    firstItem: 'Lost Chapter → Luden’s Companion',
    boots: "Sorcerer’s Shoes",
  },
}
