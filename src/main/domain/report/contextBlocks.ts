import type { MatchReport } from '@shared/types'
import type { AnchorCatalog } from './anchorCatalog'
import type { CompactExtras } from './compactContext'

// Pure. The compact-context line renderers split into composable blocks, so the
// UI can list what feeds the model, estimate its token cost, and toggle the
// optional parts. Concatenating every block in registry order reproduces the
// historical toCompactContext output byte-for-byte — this registry is the source
// of truth; compactContext.ts only delegates here.

export type ContextBlockId =
  | 'match.game'
  | 'match.core'
  | 'match.stats'
  | 'match.markers'
  | 'match.benchmark'
  | 'player.goal'
  | 'player.reflection'
  | 'carry.framing'
  | 'carry.narration'

export interface ContextBlock {
  id: ContextBlockId
  /** Where the lines come from: match facts, the player's stated intent, or carried pass outputs. */
  group: 'match' | 'player' | 'carry'
  /** Human label for UI listing. */
  label: string
  description: string
  /** Renders regardless of the enabled set — the model cannot work without it. */
  alwaysOn?: boolean
  defaultEnabled: boolean
  /** Static rough token estimate (rendered length ÷ 4 intuition) for UI budgeting. */
  typicalTokens: number
  /** External source the block depends on, when it has one. */
  requiresSource?: string
  /** Produce this block's lines (possibly none) for a report. */
  render(report: MatchReport, catalog: AnchorCatalog, extras: CompactExtras): string[]
}

function clock(tMin: number): string {
  const m = Math.floor(tMin)
  const s = Math.round((tMin - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function num(v: number | null | undefined): string {
  if (v == null) return 'n/r' // not reached / not applicable — never fabricate 0
  return String(v)
}

function quote(s: string): string {
  return JSON.stringify(s.trim())
}

/** Ordered registry — concatenation in this order reproduces today's exact line order. */
export const CONTEXT_BLOCKS: ContextBlock[] = [
  {
    id: 'match.game',
    group: 'match',
    label: 'Game line',
    description: 'Result, champion, role, duration and queue.',
    alwaysOn: true,
    defaultEnabled: true,
    typicalTokens: 25,
    render(report) {
      const { core } = report
      return [
        `GAME result=${core.win ? 'win' : 'loss'} champ=${core.champion} role=${core.role} ` +
          `dur=${clock(core.durationSec / 60)} queue=${core.queue}`
      ]
    }
  },
  {
    id: 'match.core',
    group: 'match',
    label: 'Core figures',
    description: 'KDA, CS and gold headline figures.',
    alwaysOn: true,
    defaultEnabled: true,
    typicalTokens: 30,
    render(report) {
      const { core } = report
      return [
        `CORE kda=${core.kdaRatio}(${core.kills}/${core.deaths}/${core.assists}) ` +
          `cs=${core.cs} csmin=${core.csPerMin} gold=${core.gold} gpm=${core.goldPerMin}`
      ]
    }
  },
  {
    id: 'match.stats',
    group: 'match',
    label: 'Stat anchors',
    description: 'Every stat anchor with its id, so the model cites by id.',
    defaultEnabled: true,
    typicalTokens: 120,
    render(_report, catalog) {
      const lines: string[] = []
      for (const a of catalog.values()) {
        if (a.kind === 'stat') lines.push(`STAT ${a.id}=${num(a.value)} (${a.label})`)
      }
      return lines
    }
  },
  {
    id: 'match.markers',
    group: 'match',
    label: 'Timeline markers',
    description: 'Every marker anchor with its id, time and side/position (or the no-timeline note).',
    defaultEnabled: true,
    typicalTokens: 350,
    render(report, catalog) {
      const lines: string[] = []
      for (const a of catalog.values()) {
        if (a.kind !== 'marker') continue
        const parts = [`MARK ${a.id}`, a.tMin != null ? `t=${clock(a.tMin)}` : '']
        if (a.side) parts.push(`side=${a.side}`)
        if (a.xPct != null && a.yPct != null)
          parts.push(`x=${Math.round(a.xPct)} y=${Math.round(a.yPct)}`)
        parts.push(`"${a.label}"`)
        lines.push(parts.filter(Boolean).join(' '))
      }
      if (!report.timelineAvailable) {
        lines.push('NOTE timeline_unavailable=true (no markers; use core/breakdown stats only)')
      }
      return lines
    }
  },
  {
    id: 'match.benchmark',
    group: 'match',
    label: 'Benchmark',
    description: 'The OP.GG (or general) reference behind the review.',
    defaultEnabled: true,
    typicalTokens: 25,
    requiresSource: 'opgg-mcp',
    render(_report, _catalog, extras) {
      if (!extras.benchmark) return []
      const b = extras.benchmark
      return [`BENCH ${b.metric} basis=${b.basis} ref=${b.ref}${b.patch ? ` patch=${b.patch}` : ''}`]
    }
  },
  {
    id: 'player.goal',
    group: 'player',
    label: 'Session goal',
    description: "The player's Home-screen goal (stated intent).",
    defaultEnabled: true,
    typicalTokens: 30,
    render(_report, _catalog, extras) {
      if (!extras.goal || !extras.goal.trim()) return []
      return [`NOTE goal=${quote(extras.goal)}`]
    }
  },
  {
    id: 'player.reflection',
    group: 'player',
    label: 'Match reflection',
    description: "The player's per-match reflection note (stated intent).",
    defaultEnabled: true,
    typicalTokens: 40,
    render(_report, _catalog, extras) {
      if (!extras.reflection || !extras.reflection.trim()) return []
      return [`NOTE reflection=${quote(extras.reflection)}`]
    }
  },
  {
    id: 'carry.framing',
    group: 'carry',
    label: 'Framing carry',
    description: "Pass 1's compact one-liner, carried into the heavy passes (FR-026).",
    defaultEnabled: true,
    typicalTokens: 60,
    render(_report, _catalog, extras) {
      if (!extras.framing || !extras.framing.trim()) return []
      return [`FRAMING ${extras.framing.trim()}`]
    }
  },
  {
    id: 'carry.narration',
    group: 'carry',
    label: 'Narration carry',
    description: "Pass 2's compact one-liner, carried into the heavy passes (FR-026).",
    defaultEnabled: true,
    typicalTokens: 80,
    render(_report, _catalog, extras) {
      if (!extras.narration || !extras.narration.trim()) return []
      return [`NARRATION ${extras.narration.trim()}`]
    }
  }
]

/** UI-facing block metadata — everything except the renderer. */
export type ContextBlockMeta = Omit<ContextBlock, 'render'>

/** List every block's metadata for the UI (no render functions exposed). */
export function listContextBlocks(): ContextBlockMeta[] {
  return CONTEXT_BLOCKS.map(({ render: _render, ...meta }) => meta)
}

/**
 * Render the enabled blocks in registry order. With `enabledIds` omitted every
 * block renders — byte-identical to the historical toCompactContext output.
 * alwaysOn blocks render regardless of the set.
 */
export function renderContextBlocks(
  report: MatchReport,
  catalog: AnchorCatalog,
  extras: CompactExtras = {},
  enabledIds?: Set<string>
): string {
  const lines: string[] = []
  for (const block of CONTEXT_BLOCKS) {
    if (!block.alwaysOn && enabledIds && !enabledIds.has(block.id)) continue
    lines.push(...block.render(report, catalog, extras))
  }
  return lines.join('\n')
}
