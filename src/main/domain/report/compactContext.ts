import type { MatchReport } from '@shared/types'
import type { AnchorCatalog } from './anchorCatalog'
import { renderContextBlocks } from './contextBlocks'

// Pure. Serializes the factual report + anchor catalog into a terse, token-light
// block for the model — NOT raw JSON (FR-026a). Token spend goes to content, not
// punctuation. The renderable DTOs stay the source of truth; this is only the
// model-input projection. The actual line renderers live in the composable block
// registry (contextBlocks.ts); this keeps the historical entry point.

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

/**
 * Build the compact context string. `extras` are appended for the heavier passes;
 * passes 1 & 2 pass none. Deterministic for a given report (stable for caching).
 * Renders every registry block — the canonical full projection.
 */
export function toCompactContext(
  report: MatchReport,
  catalog: AnchorCatalog,
  extras: CompactExtras = {}
): string {
  return renderContextBlocks(report, catalog, extras)
}
