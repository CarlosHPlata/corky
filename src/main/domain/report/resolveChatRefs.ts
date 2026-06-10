import type { MatchReport, EvidenceRef } from '@shared/types'
import type { AnchorCatalog } from './anchorCatalog'
import { buildAnchorCatalog } from './anchorCatalog'

// Pure (no I/O). Grounds the evidence refs a player attaches to a chat message
// ("why did I die HERE?") by resolving them against the match's anchor catalog
// and rendering one terse REF line per ref, in the same field grammar as the
// MARK/STAT lines in contextBlocks.ts — so the model sees the fact behind the
// thing the player pointed at, and never invents it. Refs that don't resolve
// render an explicit not-found line so the model knows the player pointed at
// something it can't see.

/** At most this many grounded refs per turn — beyond that the message is noise. */
const MAX_REFS_PER_TURN = 5

// Field-rendering helpers mirroring contextBlocks.ts (not exported there;
// replicated minimally to keep that registry untouched).
function clock(tMin: number): string {
  const m = Math.floor(tMin)
  const s = Math.round((tMin - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function num(v: number | null | undefined): string {
  if (v == null) return 'n/r' // not reached / not applicable — never fabricate 0
  return String(v)
}

function renderLines(catalog: AnchorCatalog, refs: EvidenceRef[]): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const ref of refs) {
    if (lines.length >= MAX_REFS_PER_TURN) break
    if (seen.has(ref.id)) continue
    seen.add(ref.id)
    const a = catalog.get(ref.id)
    if (!a) {
      lines.push(`REF ${ref.id} (not found in this match)`)
      continue
    }
    if (a.kind === 'stat') {
      lines.push(`REF ${a.id}=${num(a.value)} (${a.label})`)
      continue
    }
    const parts = [`REF ${a.id}`, a.tMin != null ? `t=${clock(a.tMin)}` : '']
    if (a.side) parts.push(`side=${a.side}`)
    if (a.xPct != null && a.yPct != null)
      parts.push(`x=${Math.round(a.xPct)} y=${Math.round(a.yPct)}`)
    parts.push(`"${a.label}"`)
    lines.push(parts.filter(Boolean).join(' '))
  }
  return lines
}

/**
 * Lazily-grounding renderer for a whole conversation: the catalog is built once,
 * on the first call that actually carries refs, then reused across turns.
 */
export function makeRefLineRenderer(report: MatchReport): (refs: EvidenceRef[]) => string[] {
  let catalog: AnchorCatalog | null = null
  return (refs) => {
    catalog ??= buildAnchorCatalog(report)
    return renderLines(catalog, refs)
  }
}

/** Render one REF grounding line per attached ref (deduped by id, capped at 5). */
export function renderRefLines(report: MatchReport, refs: EvidenceRef[]): string[] {
  return renderLines(buildAnchorCatalog(report), refs)
}
