import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { LaneMetaChampion, ChampionAnalysis } from './opggTypes'
import type { ChampionBuildInsight, LaneMatchupInsight } from '../../../application/ports/ChampionInsightsDataSource'
import { eventBus } from '../../../application/events/EventBus'
import { preview } from '../../../application/events/telemetry'

const OPGG_MCP_URL = 'https://mcp-api.op.gg/mcp'
const TIMEOUT_MS = 3000

// COMPLIANCE (Constitution I / FR-019): only public meta tools are ever called.
// No player-account lookups via OP.GG — the player's own facts come from Riot.
const TOOL_LANE_META = 'lol_list_lane_meta_champions'
const TOOL_CHAMPION_ANALYSIS = 'lol_get_champion_analysis'
const TOOL_LANE_MATCHUP = 'lol_get_lane_matchup_guide'

/** OP.GG champion analysis returns compact class-notation text, NOT JSON.
 *  Lane matchup guide returns real JSON as text.
 *  RawToolCall now returns the raw text string so each caller can parse appropriately. */
export type RawToolCall = (name: string, args: Record<string, unknown>) => Promise<unknown | null>

// ---- OP.GG parameter normalization ----

/** "Lee Sin" → "LEE_SIN" — OP.GG requires UPPER_SNAKE_CASE champion names */
function toOpggChampion(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
}

/** "MID" → "mid" — OP.GG requires lowercase positions */
function toOpggPosition(role: string): string {
  return role.toLowerCase()
}

/** Riot summoner spell IDs to human-readable names */
const SUMMONER_SPELL_NAMES: Record<number, string> = {
  1: 'Cleanse', 3: 'Exhaust', 4: 'Flash', 6: 'Ghost', 7: 'Heal',
  11: 'Smite', 12: 'Teleport', 13: 'Clarity', 14: 'Ignite', 21: 'Barrier',
  32: 'Snowball'
}

// ---- generic helpers for JSON-returning tools ----

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** OP.GG sometimes expresses rates as percentages — normalize to 0..1. */
function rate(v: unknown): number {
  const n = num(v)
  if (n === undefined) return 0
  return n > 1 ? n / 100 : n
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function pick<T>(o: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) if (o[k] != null) return o[k] as T
  return undefined
}

/** Find the champion array inside an unknown OP.GG payload shape. */
function asArray(raw: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[]
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    for (const k of ['data', 'champions', 'result', 'list']) {
      if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[]
    }
  }
  return null
}

function patchOf(raw: unknown): string | undefined {
  if (raw && typeof raw === 'object') return str(pick<string>(raw as Record<string, unknown>, ['patch', 'version']))
  return undefined
}

/** Try JSON.parse on a string, or return the value as-is if already an object.
 *  Used by JSON-returning tools (lane meta, lane matchup guide). */
function tryJson(raw: unknown): unknown | null {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return null }
  }
  return raw // already an object (injected by unit tests)
}

// ---- class-notation parsers for lol_get_champion_analysis ----
// OP.GG returns compact class-notation text, e.g.:
// LolGetChampionAnalysis(Data(Runes("Domination",["Hail of Blades",...,"Sorcery",[...]),
//   CoreItems(["Shadowflame","Rabadon's Deathcap"],0.16),Boots(["Sorcerer's Shoes"]),
//   Boots(["Doran's Ring","Health Potion"]),Boots([4,14]),SkillMasteries(["Q","E","W"])))
//
// With desired_output_fields=["average_stats","runes","core_items","boots",
//   "starter_items","summoner_spells","skill_masteries"], the Data tuple order is:
//   AverageStats, Runes, CoreItems, Boots(shoes), Boots(starter), Boots(spell IDs), SkillMasteries

/** Extract all quoted strings from a comma-separated section */
function parseStringArray(s: string): string[] {
  return [...s.matchAll(/"([^"]*)"/g)].map((m) => m[1]).filter(Boolean)
}

/** Parse Runes("primary",[...],"secondary",[...]) — keystone is first primary rune */
function parseRunes(text: string): { primaryTree: string; keystone: string; secondaryTree: string } | null {
  const m = text.match(/Runes\("([^"]+)",\[([^\]]+)\],"([^"]+)"/)
  if (!m) return null
  const primaryRunes = parseStringArray(m[2])
  return { primaryTree: m[1], keystone: primaryRunes[0] ?? '', secondaryTree: m[3] }
}

/** Parse CoreItems([...],rate) → item name array */
function parseCoreItems(text: string): string[] | null {
  const m = text.match(/CoreItems\(\[([^\]]+)\]/)
  if (!m) return null
  return parseStringArray(m[1])
}

/** Parse ALL Boots([...]) blocks in text order.
 *  In the 6-field desired_output_fields response:
 *    [0] = boots (shoe names), [1] = starter items (names), [2] = summoner spells (IDs → names) */
function parseBootsAll(text: string): string[][] {
  const re = /Boots\(\[([^\]]*)\]\)/g
  const results: string[][] = []
  let m
  while ((m = re.exec(text)) !== null) {
    const inner = m[1].trim()
    if (!inner) { results.push([]); continue }
    if (inner.includes('"')) {
      results.push(parseStringArray(inner))
    } else {
      const ids = inner.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n))
      results.push(ids.map((id) => SUMMONER_SPELL_NAMES[id] ?? String(id)))
    }
  }
  return results
}

/** Parse SkillMasteries(["Q","E","W"]) → ["Q","E","W"] */
function parseSkillMasteries(text: string): string[] | null {
  const m = text.match(/SkillMasteries\(\[([^\]]+)\]\)/)
  if (!m) return null
  return parseStringArray(m[1])
}

/** Parse win_rate from AverageStats(plays, win_rate, ...) — second positional arg */
function parseWinRate(text: string): number | null {
  const m = text.match(/AverageStats\([^,]+,\s*([\d.]+)/)
  if (!m) return null
  const v = parseFloat(m[1])
  if (!Number.isFinite(v)) return null
  return v > 1 ? v / 100 : v
}

// ---- public mapper functions ----

/**
 * Map an OP.GG lane-meta payload to typed champions. Accepts either a raw text
 * string (live API — JSON text) or an already-parsed object (unit tests).
 */
export function mapLaneMeta(raw: unknown): LaneMetaChampion[] | null {
  const parsed = tryJson(raw)
  const rows = asArray(parsed)
  if (!rows) return null
  const patch = patchOf(parsed)
  const mapped = rows
    .map((r): LaneMetaChampion | null => {
      const champion = str(pick(r, ['champion', 'championName', 'champion_name', 'name']))
      const position = str(pick(r, ['position', 'role', 'lane'])) ?? ''
      if (!champion) return null
      return {
        champion,
        position,
        winRate: rate(pick(r, ['win_rate', 'winRate', 'winrate'])),
        pickRate: rate(pick(r, ['pick_rate', 'pickRate'])),
        banRate: rate(pick(r, ['ban_rate', 'banRate'])),
        tier: str(pick(r, ['tier', 'tier_rank', 'rank'])) ?? '',
        avgKda: num(pick(r, ['kda', 'avg_kda', 'avgKda'])),
        csPerMin: num(pick(r, ['cs_per_min', 'csPerMin', 'cspm'])),
        patch
      }
    })
    .filter((x): x is LaneMetaChampion => x !== null)
  return mapped.length ? mapped : null
}

/**
 * Map champion-analysis response to a benchmark insight.
 * Accepts class-notation text (live API) or a JSON object (unit tests).
 */
export function mapChampionAnalysis(raw: unknown, champion: string, position: string): ChampionAnalysis | null {
  if (typeof raw === 'string') {
    const winRate = parseWinRate(raw)
    if (winRate === null) return null
    // pick rate is not in the compact desired_output_fields response
    return { champion, position, winRate, pickRate: 0 }
  }
  // Legacy JSON object path (unit tests inject plain objects)
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const winRate = pick(o, ['win_rate', 'winRate', 'winrate'])
  if (winRate == null) return null
  return {
    champion,
    position,
    winRate: rate(winRate),
    pickRate: rate(pick(o, ['pick_rate', 'pickRate'])),
    patch: patchOf(o)
  }
}

/** Extract a human-readable name string from various OP.GG shapes. */
function nameOf(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v && typeof v === 'object') return str(pick(v as Record<string, unknown>, ['name', 'championName', 'champion_name', 'itemName']))
  return undefined
}

/** Extract an ordered list of item names from a build object trying several field aliases. */
function itemNames(o: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const arr = asArray(o[key])
    if (arr && arr.length > 0) {
      const names = arr.map((it: unknown) => nameOf(it)).filter((n): n is string => !!n)
      if (names.length > 0) return names
    }
  }
  return []
}

/**
 * Map champion-analysis response to a build insight.
 * Accepts class-notation text (live API) or a JSON object (unit tests / legacy).
 * With desired_output_fields=["average_stats","runes","core_items","boots",
 *   "starter_items","summoner_spells","skill_masteries"] the Data tuple order is fixed.
 */
export function mapChampionBuildInsight(raw: unknown, champion: string, position: string): ChampionBuildInsight | null {
  if (typeof raw === 'string') {
    const runes = parseRunes(raw)
    if (!runes) return null

    const coreItems = parseCoreItems(raw) ?? []
    const allBoots = parseBootsAll(raw)
    // Boots tuple order matches desired_output_fields: [boots shoes, starter items, spell IDs]
    const bootShoes = allBoots[0] ?? []
    const startItems = allBoots[1] ?? []
    const spellItems = allBoots[2] ?? []
    const skills = parseSkillMasteries(raw)

    if (runes.keystone === '' && coreItems.length === 0) return null

    return {
      champion,
      position,
      coreItems: coreItems.length > 0 ? [...coreItems, ...bootShoes] : bootShoes,
      startItems,
      keystone: runes.keystone,
      primaryTree: runes.primaryTree,
      ...(runes.secondaryTree ? { secondaryTree: runes.secondaryTree } : {}),
      ...(skills?.length ? { skillOrder: skills.join(' > ') } : {}),
      ...(spellItems.length > 0 ? { summonerSpells: spellItems } : {})
    }
  }

  // Legacy JSON object path (unit tests)
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  const buildsArr = asArray(pick(o, ['builds', 'item_builds', 'best_builds', 'recommended_builds', 'item_pages']))
  const build = (buildsArr?.[0] ?? null) as Record<string, unknown> | null
  const coreItems = build
    ? itemNames(build, ['items', 'core_items', 'item_list', 'coreItems'])
    : itemNames(o, ['items', 'core_items', 'coreItems'])
  const startItems = build
    ? itemNames(build, ['start_items', 'starting_items', 'starter', 'startItems'])
    : itemNames(o, ['start_items', 'starting_items'])

  const runesArr = asArray(pick(o, ['runes', 'rune_pages', 'best_runes', 'perks', 'runepages']))
  const rune = (runesArr?.[0] ?? null) as Record<string, unknown> | null
  const runeRoot = rune ?? o

  const keystoneRaw = pick(runeRoot, ['keystone', 'main_rune', 'keystoneRune', 'primaryRune', 'main_perk'])
  const keystone = nameOf(keystoneRaw) ?? ''
  const primaryTreeRaw = pick(runeRoot, ['primary_page', 'primaryPage', 'primary_style', 'primaryStyle', 'rune_tree', 'main_page'])
  const primaryTree = nameOf(primaryTreeRaw) ?? ''
  const secondaryTreeRaw = pick(runeRoot, ['secondary_page', 'secondaryPage', 'sub_style', 'subStyle', 'secondary_style'])
  const secondaryTree = secondaryTreeRaw ? nameOf(secondaryTreeRaw) : undefined

  if (!keystone && coreItems.length === 0) return null

  const skillsRaw = pick(o, ['skills', 'skill_order', 'ability_order', 'skillOrder']) as Record<string, unknown> | null
  let skillOrder: string | undefined
  if (skillsRaw) {
    const ord = pick(skillsRaw, ['order', 'summary', 'priority', 'sequence'])
    if (typeof ord === 'string' && ord.length > 0) skillOrder = ord
    else if (Array.isArray(ord) && ord.length > 0) skillOrder = ord.join(' > ')
  }

  const spellsArr = asArray(pick(o, ['summoner_spells', 'spells', 'summonerSpells', 'summonerspells']))
  const summonerSpells = spellsArr
    ? spellsArr.map((s: unknown) => nameOf(s)).filter((n): n is string => !!n).slice(0, 2)
    : undefined

  return {
    champion,
    position,
    patch: patchOf(o),
    coreItems,
    startItems,
    keystone,
    primaryTree,
    ...(secondaryTree ? { secondaryTree } : {}),
    ...(skillOrder ? { skillOrder } : {}),
    ...(summonerSpells && summonerSpells.length > 0 ? { summonerSpells } : {})
  }
}

/**
 * Map the lane-matchup-guide response to a matchup insight.
 * Accepts a raw text string (live API — JSON text) or an already-parsed object (unit tests).
 * Returns null when nothing useful can be extracted.
 */
export function mapLaneMatchupGuide(raw: unknown, champion: string, opponent: string, position: string): LaneMatchupInsight | null {
  const parsed = tryJson(raw)
  if (!parsed || typeof parsed !== 'object') return null

  // Unwrap common OP.GG nesting: raw.data, raw.data.matchup, etc.
  let o = parsed as Record<string, unknown>
  if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
    const d = o.data as Record<string, unknown>
    if (d.matchup && typeof d.matchup === 'object' && !Array.isArray(d.matchup)) {
      o = d.matchup as Record<string, unknown>
    } else if (Array.isArray(d.counters) && d.counters.length > 0) {
      o = d.counters[0] as Record<string, unknown>
    } else {
      o = d
    }
  }

  const tipsRaw = pick(o, ['tips', 'guide', 'advice', 'matchup_tips', 'matchupTips', 'countertips'])
  let tips: string[] = []
  if (Array.isArray(tipsRaw)) {
    tips = tipsRaw
      .map((t: unknown) => {
        if (typeof t === 'string' && t.length > 0) return t
        if (t && typeof t === 'object') return str(pick(t as Record<string, unknown>, ['text', 'tip', 'content', 'description']))
        return undefined
      })
      .filter((t): t is string => !!t)
      .slice(0, 5)
  } else if (tipsRaw && typeof tipsRaw === 'object') {
    // Tips might be an object with keys like { attack: [...], caution: [...] }
    const tipObj = tipsRaw as Record<string, unknown>
    for (const key of Object.keys(tipObj)) {
      if (Array.isArray(tipObj[key])) {
        tips.push(...(tipObj[key] as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 3))
      }
    }
    tips = tips.slice(0, 5)
  }

  const diffRaw = pick(o, ['difficulty', 'matchup_difficulty', 'lane_difficulty'])
  const difficulty = typeof diffRaw === 'string' && diffRaw.length > 0
    ? diffRaw
    : diffRaw && typeof diffRaw === 'object'
      ? str(pick(diffRaw as Record<string, unknown>, ['label', 'name', 'value']))
      : undefined

  const counterArr = asArray(pick(o, ['counter_items', 'counterItems', 'recommended_items', 'items_to_buy']))
  const counterItems = counterArr
    ? counterArr.map((c: unknown) => nameOf(c)).filter((n): n is string => !!n).slice(0, 4)
    : undefined

  // Return null only if we have neither tips nor difficulty (truly empty response)
  if (tips.length === 0 && !difficulty && !counterItems?.length) return null

  return {
    champion,
    opponent,
    position,
    ...(difficulty ? { difficulty } : {}),
    tips,
    ...(counterItems && counterItems.length > 0 ? { counterItems } : {})
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('OP.GG MCP timeout')), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

/** Extract the raw text from an MCP CallToolResult content block. */
function extractText(result: unknown): string | null {
  const content = (result as { content?: unknown })?.content
  if (!Array.isArray(content)) return null
  for (const block of content) {
    const b = block as { type?: string; text?: string }
    if (b?.type === 'text' && typeof b.text === 'string' && b.text.length > 0) {
      return b.text
    }
  }
  return null
}

function createSdkRawCall(url = OPGG_MCP_URL): RawToolCall {
  let clientPromise: Promise<Client> | null = null
  const getClient = (): Promise<Client> => {
    if (!clientPromise) {
      clientPromise = (async () => {
        const client = new Client({ name: 'corky', version: '0.1.0' })
        await client.connect(new StreamableHTTPClientTransport(new URL(url)))
        return client
      })().catch((e) => {
        clientPromise = null // allow a later retry if the first connect failed
        throw e
      })
    }
    return clientPromise
  }
  return async (name, args) => {
    const client = await getClient()
    const result = await withTimeout(client.callTool({ name, arguments: args }), TIMEOUT_MS)
    // Return raw text — each mapper decides whether to JSON.parse or regex-parse
    return extractText(result)
  }
}

/**
 * Tier-1 reusable OP.GG integration (see contracts/opgg-mcp-client.md). Owns the
 * MCP transport, a shared process-lifetime cache, timeouts, and typed mapping.
 * Best-effort: every method resolves to null rather than throwing, so callers
 * (per-feature ports) can fall back. Built to be reused across features — inject
 * a single shared instance from the composition root.
 */
export class OpggMcpClient {
  private readonly cache = new Map<string, unknown | null>()

  constructor(private readonly rawCall: RawToolCall = createSdkRawCall()) {}

  /** Every MCP tool call (and cache hit) is reported on the event bus — tool
   * name, args, cache state, and a preview of the RAW response. This is the
   * observability that makes "the MCP returned something we can't parse"
   * visible instead of silently mapping to null. */
  private async cached(key: string, name: string, args: Record<string, unknown>): Promise<unknown | null> {
    if (this.cache.has(key)) {
      const hit = this.cache.get(key) ?? null
      eventBus.emit({
        type: 'telemetry.outbound', target: 'opgg-mcp', name: 'OpggMcpClient', method: name,
        durationMs: 0, ok: hit !== null, cache: 'hit', args: preview(args, 120), preview: preview(hit)
      })
      return hit
    }
    const started = Date.now()
    let error: unknown
    const value = await this.rawCall(name, args).catch((e) => {
      error = e
      return null
    })
    eventBus.emit({
      type: 'telemetry.outbound', target: 'opgg-mcp', name: 'OpggMcpClient', method: name,
      durationMs: Date.now() - started, ok: value !== null, cache: 'miss',
      args: preview(args, 120),
      ...(value !== null ? { preview: preview(value) } : {}),
      ...(error !== undefined ? { error: preview(error instanceof Error ? error.message : error, 200) } : {})
    })
    this.cache.set(key, value)
    return value
  }

  async getLaneMeta(input: { gameMode?: string; lang?: string } = {}): Promise<LaneMetaChampion[] | null> {
    const gameMode = input.gameMode ?? 'ranked'
    const lang = input.lang ?? 'en_US'
    const raw = await this.cached(`laneMeta:${gameMode}:${lang}`, TOOL_LANE_META, { game_mode: gameMode, lang })
    return mapLaneMeta(raw)
  }

  /** Shared raw fetch for champion-analysis — both analysis and build callers
   *  share the same process-lifetime cache entry, so only one MCP call is made.
   *  Champion name is UPPER_SNAKE_CASE and position is lowercase per OP.GG API. */
  private async champAnalysisRaw(champion: string, position: string, gameMode: string, lang: string): Promise<unknown | null> {
    const opggChamp = toOpggChampion(champion)
    const opggPos = toOpggPosition(position)
    const key = `champAnalysis:${opggChamp}:${opggPos}:${gameMode}:${lang}`
    return this.cached(key, TOOL_CHAMPION_ANALYSIS, {
      champion: opggChamp,
      position: opggPos,
      game_mode: gameMode,
      lang,
      desired_output_fields: ['average_stats', 'runes', 'core_items', 'boots', 'starter_items', 'summoner_spells', 'skill_masteries']
    })
  }

  async getChampionAnalysis(input: {
    champion: string
    position: string
    gameMode?: string
    lang?: string
  }): Promise<ChampionAnalysis | null> {
    const gameMode = input.gameMode ?? 'ranked'
    const lang = input.lang ?? 'en_US'
    const raw = await this.champAnalysisRaw(input.champion, input.position, gameMode, lang)
    return mapChampionAnalysis(raw, input.champion, input.position)
  }

  async getChampionBuild(input: {
    champion: string
    position: string
    gameMode?: string
    lang?: string
  }): Promise<ChampionBuildInsight | null> {
    const gameMode = input.gameMode ?? 'ranked'
    const lang = input.lang ?? 'en_US'
    const raw = await this.champAnalysisRaw(input.champion, input.position, gameMode, lang)
    return mapChampionBuildInsight(raw, input.champion, input.position)
  }

  async getLaneMatchupGuide(input: {
    champion: string
    opponent: string
    position: string
    gameMode?: string
    lang?: string
  }): Promise<LaneMatchupInsight | null> {
    const gameMode = input.gameMode ?? 'ranked'
    const lang = input.lang ?? 'en_US'
    const opggChamp = toOpggChampion(input.champion)
    const opggOpp = toOpggChampion(input.opponent)
    const opggPos = toOpggPosition(input.position)
    const key = `matchupGuide:${opggChamp}:${opggOpp}:${opggPos}:${gameMode}:${lang}`
    const raw = await this.cached(key, TOOL_LANE_MATCHUP, {
      my_champion: opggChamp,
      opponent_champion: opggOpp,
      position: opggPos,
      game_mode: gameMode,
      lang
    })
    return mapLaneMatchupGuide(raw, input.champion, input.opponent, input.position)
  }
}
