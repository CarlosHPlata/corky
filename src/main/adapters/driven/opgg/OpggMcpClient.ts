import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { LaneMetaChampion, ChampionAnalysis } from './opggTypes'

const OPGG_MCP_URL = 'https://mcp-api.op.gg/mcp'
const TIMEOUT_MS = 3000

// COMPLIANCE (Constitution I / FR-019): only public meta tools are ever called.
// No player-account lookups via OP.GG — the player's own facts come from Riot.
const TOOL_LANE_META = 'lol_list_lane_meta_champions'
const TOOL_CHAMPION_ANALYSIS = 'lol_get_champion_analysis'

/** Performs one raw MCP tool call, returning parsed JSON or null on any failure. */
export type RawToolCall = (name: string, args: Record<string, unknown>) => Promise<unknown | null>

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

/**
 * Map an OP.GG lane-meta payload to typed champions. The exact field names are
 * NOT documented by OP.GG, so this reads several plausible aliases and tolerates
 * misses — anything unparseable yields null so the caller falls back to the
 * general benchmark. Verify the aliases against a live response when possible.
 */
export function mapLaneMeta(raw: unknown): LaneMetaChampion[] | null {
  const rows = asArray(raw)
  if (!rows) return null
  const patch = patchOf(raw)
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

export function mapChampionAnalysis(raw: unknown, champion: string, position: string): ChampionAnalysis | null {
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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('OP.GG MCP timeout')), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

/** Extract the first JSON text block from an MCP CallToolResult. */
function extractJson(result: unknown): unknown | null {
  const content = (result as { content?: unknown })?.content
  if (!Array.isArray(content)) return null
  for (const block of content) {
    const b = block as { type?: string; text?: string }
    if (b?.type === 'text' && typeof b.text === 'string') {
      try {
        return JSON.parse(b.text)
      } catch {
        return null
      }
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
    return extractJson(result)
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

  private async cached(key: string, name: string, args: Record<string, unknown>): Promise<unknown | null> {
    if (this.cache.has(key)) return this.cache.get(key) ?? null
    const value = await this.rawCall(name, args).catch(() => null)
    this.cache.set(key, value)
    return value
  }

  async getLaneMeta(input: { gameMode?: string; lang?: string } = {}): Promise<LaneMetaChampion[] | null> {
    const gameMode = input.gameMode ?? 'ranked'
    const lang = input.lang ?? 'en_US'
    const raw = await this.cached(`laneMeta:${gameMode}:${lang}`, TOOL_LANE_META, { game_mode: gameMode, lang })
    return mapLaneMeta(raw)
  }

  async getChampionAnalysis(input: {
    champion: string
    position: string
    gameMode?: string
    lang?: string
  }): Promise<ChampionAnalysis | null> {
    const gameMode = input.gameMode ?? 'ranked'
    const lang = input.lang ?? 'en_US'
    const key = `champAnalysis:${input.champion}:${input.position}:${gameMode}:${lang}`
    const raw = await this.cached(key, TOOL_CHAMPION_ANALYSIS, {
      champion: input.champion,
      position: input.position,
      game_mode: gameMode,
      lang
    })
    return mapChampionAnalysis(raw, input.champion, input.position)
  }
}
