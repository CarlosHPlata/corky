import type { MatchReport } from '@shared/types'
import type { AnchorCatalog } from './anchorCatalog'

// Pure. Serializes the factual report + anchor catalog into a terse, token-light
// block for the model — NOT raw JSON (FR-026a). Token spend goes to content, not
// punctuation. The renderable DTOs stay the source of truth; this is only the
// model-input projection.

/** Extra context fed to the heavier passes (compact summaries, never raw JSON). */
export interface CompactExtras {
  /** Benchmark reference behind the review (pass 3). */
  benchmark?: { metric: string; basis: string; ref: number; patch?: string } | null
  /** The player's Home-screen goal (stated intent). */
  goal?: string
  /** The player's per-match reflection note (stated intent). */
  reflection?: string
  /** Compact one-liners carried from passes 1 & 2 into pass 3 (FR-026). */
  framing?: string
  narration?: string
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

/**
 * Build the compact context string. `extras` are appended for the heavier passes;
 * passes 1 & 2 pass none. Deterministic for a given report (stable for caching).
 */
export function toCompactContext(
  report: MatchReport,
  catalog: AnchorCatalog,
  extras: CompactExtras = {}
): string {
  const { core } = report
  const lines: string[] = []

  lines.push(
    `GAME result=${core.win ? 'win' : 'loss'} champ=${core.champion} role=${core.role} ` +
      `dur=${clock(core.durationSec / 60)} queue=${core.queue}`
  )
  lines.push(
    `CORE kda=${core.kdaRatio}(${core.kills}/${core.deaths}/${core.assists}) ` +
      `cs=${core.cs} csmin=${core.csPerMin} gold=${core.gold} gpm=${core.goldPerMin}`
  )

  // STAT lines — every stat anchor with its id, so the model cites by id.
  for (const a of catalog.values()) {
    if (a.kind === 'stat') lines.push(`STAT ${a.id}=${num(a.value)} (${a.label})`)
  }

  // MARK lines — every marker anchor with its id, time, side/position.
  for (const a of catalog.values()) {
    if (a.kind !== 'marker') continue
    const parts = [`MARK ${a.id}`, a.tMin != null ? `t=${clock(a.tMin)}` : '']
    if (a.side) parts.push(`side=${a.side}`)
    if (a.xPct != null && a.yPct != null) parts.push(`x=${Math.round(a.xPct)} y=${Math.round(a.yPct)}`)
    parts.push(`"${a.label}"`)
    lines.push(parts.filter(Boolean).join(' '))
  }

  if (!report.timelineAvailable) {
    lines.push('NOTE timeline_unavailable=true (no markers; use core/breakdown stats only)')
  }

  if (extras.benchmark) {
    const b = extras.benchmark
    lines.push(`BENCH ${b.metric} basis=${b.basis} ref=${b.ref}${b.patch ? ` patch=${b.patch}` : ''}`)
  }
  if (extras.goal && extras.goal.trim()) lines.push(`NOTE goal=${quote(extras.goal)}`)
  if (extras.reflection && extras.reflection.trim()) lines.push(`NOTE reflection=${quote(extras.reflection)}`)
  if (extras.framing && extras.framing.trim()) lines.push(`FRAMING ${extras.framing.trim()}`)
  if (extras.narration && extras.narration.trim()) lines.push(`NARRATION ${extras.narration.trim()}`)

  return lines.join('\n')
}
