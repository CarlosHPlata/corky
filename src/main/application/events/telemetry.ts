/**
 * Cross-cutting observability events (observer pattern over the shared bus).
 * Emitted at the two architectural boundaries — every driving call INTO the
 * application layer and every driven call OUT to an external system (sqlite,
 * Riot API, Anthropic, OP.GG MCP) — plus the discovery agent's plan/fetch
 * trail. Subscribers (infrastructure/telemetryLogger) decide how to render;
 * emitters never format.
 */

/** A driving-side call into an application use case (command or query). */
export interface AppCallEvent {
  type: 'telemetry.app'
  /** Use case class name, e.g. 'CoachChat'. */
  name: string
  /** Method invoked, e.g. 'execute'. */
  method: string
  durationMs: number
  ok: boolean
  error?: string
}

/** A driven-side call out to an external system. */
export interface OutboundCallEvent {
  type: 'telemetry.outbound'
  /** External system: 'sqlite' | 'riot-api' | 'anthropic' | 'opgg-mcp'. */
  target: string
  /** Adapter name, e.g. 'MatchRepository' or 'OpggMcpClient'. */
  name: string
  /** Method or remote tool name, e.g. 'getMatchDetail' or 'lol_get_champion_analysis'. */
  method: string
  durationMs: number
  ok: boolean
  /** Set by callers that keep a cache in front of the remote call. */
  cache?: 'hit' | 'miss'
  /** Compact preview of the call arguments (already truncated). */
  args?: string
  /** Compact preview of what came back (already truncated). */
  preview?: string
  error?: string
}

/** The discovery agent decided what external data this question needs. */
export interface DiscoveryPlanEvent {
  type: 'telemetry.discovery.plan'
  question: string
  requests: { kind: string; query?: string }[]
  /** Present when the planner itself failed (the chat continues without a dossier). */
  error?: string
}

/** One honored discovery request was fetched — and what it actually got. */
export interface DiscoveryFetchEvent {
  type: 'telemetry.discovery.fetch'
  kind: string
  /** Config source that served it, e.g. 'opgg-mcp' or 'local-som'. */
  source: string
  /** False when the fetch failed or came back empty. */
  ok: boolean
  /** The dossier lines produced (what the coach model will actually see). */
  lines: string[]
}

export type TelemetryEvent =
  | AppCallEvent
  | OutboundCallEvent
  | DiscoveryPlanEvent
  | DiscoveryFetchEvent

/** Render any value as a single truncated line, safe to log. */
export function preview(v: unknown, max = 160): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  let s: string
  if (typeof v === 'string') s = v
  else {
    try {
      s = JSON.stringify(v) ?? String(v)
    } catch {
      s = String(v)
    }
  }
  const flat = s.replace(/\s+/g, ' ')
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}
