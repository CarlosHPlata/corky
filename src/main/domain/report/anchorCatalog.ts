import type { MatchReport, EvidenceRef } from '@shared/types'

// Pure (no imports beyond shared types, no I/O). Enumerates the evidence anchors
// a coaching pass may cite — built entirely from the spec-003 factual report, so
// the model can only reference facts that actually exist (hybrid anchoring,
// FR-007). A structured claim whose ref.id is not in this catalog is dropped.

export interface Anchor {
  id: string
  kind: 'stat' | 'marker'
  /** Human label for prompt context / chip text. */
  label: string
  /** In-game minute (markers). */
  tMin?: number
  /** Which side benefited (markers). */
  side?: 'ally' | 'enemy' | 'neutral'
  /** Normalized map position 0–100 (death markers). */
  xPct?: number
  yPct?: number
  /** The numeric value, when the anchor is a stat (null ⇒ not reached). */
  value?: number | null
}

export type AnchorCatalog = Map<string, Anchor>

function stat(catalog: AnchorCatalog, key: string, label: string, value: number | null): void {
  catalog.set(`stat:${key}`, { id: `stat:${key}`, kind: 'stat', label, value })
}

/** Build the enumerated anchor catalog for a match's factual report. */
export function buildAnchorCatalog(report: MatchReport): AnchorCatalog {
  const catalog: AnchorCatalog = new Map()
  const { core, breakdown } = report

  // Stat anchors — every computed headline + breakdown figure.
  stat(catalog, 'kda', 'KDA ratio', core.kdaRatio)
  stat(catalog, 'cs', 'CS', core.cs)
  stat(catalog, 'cs_per_min', 'CS per minute', core.csPerMin)
  stat(catalog, 'gold', 'Total gold', core.gold)
  stat(catalog, 'gold_per_min', 'Gold per minute', core.goldPerMin)
  stat(catalog, 'cs_at_10', 'CS at 10:00', breakdown.csAt10)
  stat(catalog, 'gold_at_14', 'Gold diff at 14:00', breakdown.goldAt14)
  stat(catalog, 'gold_at_24', 'Gold diff at 24:00', breakdown.goldAt24)
  stat(catalog, 'vision_score', 'Vision score', breakdown.visionScore)
  stat(catalog, 'solo_deaths', 'Solo deaths', breakdown.soloDeaths)
  stat(catalog, 'kill_participation', 'Kill participation', breakdown.killParticipation)

  // Marker anchors — one per spec-003 timeline highlight, numbered per kind.
  // Highlight kinds: objective / teamfight / death-driven swing.
  if (report.timeline) {
    const counters: Record<string, number> = { objective: 0, teamfight: 0, swing: 0 }
    for (const h of report.timeline.highlights) {
      const bucket = h.kind === 'death' ? 'swing' : h.kind
      const n = (counters[bucket] = (counters[bucket] ?? 0) + 1)
      const id = `marker:${bucket}#${n}`
      catalog.set(id, { id, kind: 'marker', label: h.label, tMin: h.tMin, side: h.side })
    }
  }

  // Player death markers — one per death-map dot (the player's own deaths).
  if (report.deathMap) {
    for (const d of report.deathMap.deaths) {
      const id = `marker:death#${d.n}`
      catalog.set(id, {
        id,
        kind: 'marker',
        label: `Death ${d.n}`,
        tMin: d.tMin,
        xPct: d.xPct,
        yPct: d.yPct
      })
    }
  }

  return catalog
}

/** True when a structured ref points at an anchor that exists (FR-007 drop rule). */
export function isValidStructuredRef(catalog: AnchorCatalog, ref: EvidenceRef): boolean {
  if (ref.kind === 'stat' || ref.kind === 'marker') return catalog.has(ref.id)
  // benchmark / note are typed free-form chips — always allowed.
  return ref.kind === 'benchmark' || ref.kind === 'note'
}
