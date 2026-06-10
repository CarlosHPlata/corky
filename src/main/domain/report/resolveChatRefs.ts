import type { MatchReport, EvidenceRef, StandingFocusTask } from '@shared/types'
import type { AnchorCatalog } from './anchorCatalog'
import { buildAnchorCatalog } from './anchorCatalog'

// Pure (no I/O). Grounds the evidence refs a player attaches to a chat message
// ("why did I die HERE?") by resolving them against the match's anchor catalog
// — and, since spec 005, `task:<id>` refs against the standing focus-task set
// — rendering one terse REF line per ref, in the same field grammar as the
// MARK/STAT lines in contextBlocks.ts — so the model sees the fact behind the
// thing the player pointed at, and never invents it. Refs that don't resolve
// render an explicit not-found line so the model knows the player pointed at
// something it can't see (a task retired between pick and send included).

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

/** One grounded line for a `task:<id>` ref, from the standing set. */
function renderTaskLine(taskId: string, standing: StandingFocusTask[]): string | null {
  const t = standing.find((s) => s.id === taskId)
  if (!t) return null
  return `REF task:${t.id} "${t.description}" rule=${t.metric}${t.comparator}${t.target} scope=${t.scope} status=${t.status}`
}

function renderLines(catalog: AnchorCatalog, refs: EvidenceRef[], standing: StandingFocusTask[]): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const ref of refs) {
    if (lines.length >= MAX_REFS_PER_TURN) break
    if (seen.has(ref.id)) continue
    seen.add(ref.id)
    if (ref.id.startsWith('task:')) {
      const line = renderTaskLine(ref.id.slice('task:'.length), standing)
      lines.push(line ?? `REF ${ref.id} (not found in this match)`)
      continue
    }
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
 * `standing` feeds `task:` refs (spec 005) — omit it where tasks can't be
 * referenced and any task ref grounds as not-found.
 */
export function makeRefLineRenderer(
  report: MatchReport,
  standing: StandingFocusTask[] = []
): (refs: EvidenceRef[]) => string[] {
  let catalog: AnchorCatalog | null = null
  return (refs) => {
    catalog ??= buildAnchorCatalog(report)
    return renderLines(catalog, refs, standing)
  }
}

/** Render one REF grounding line per attached ref (deduped by id, capped at 5). */
export function renderRefLines(
  report: MatchReport,
  refs: EvidenceRef[],
  standing: StandingFocusTask[] = []
): string[] {
  return renderLines(buildAnchorCatalog(report), refs, standing)
}
