// Corky post-game report — shared formatting + evidence-ref minting.
//
// Pure helpers used across the report's sub-components. The ref minters
// (`statRef`/`deathRef`/`toTimelineEvents`) reproduce the EXACT id grammar of
// the main-side anchorCatalog so chat grounding resolves each anchor 1:1.

import type { DeathNarration, EvidenceRef, Highlight } from '@shared/types'

export const ROLE_ABBR: Record<string, string> = {
  Top: 'TOP', Jungle: 'JNG', Mid: 'MID', Bot: 'BOT', Support: 'SUP',
}

export function fmtClock(tMin: number): string {
  const m = Math.floor(tMin)
  const s = Math.round((tMin - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function goldK(gold: number): string {
  return (gold / 1000).toFixed(1) + 'k'
}

export function goldDiffK(n: number): string {
  return (n >= 0 ? '+' : '−') + Math.abs(n / 1000).toFixed(1) + 'k'
}

export function fmtDmg(n: number): string {
  return n.toLocaleString('en-US')
}

// First three letters of a name, upper-cased — the offline fallback glyph.
export function code3(name: string): string {
  return (name.match(/[A-Za-z]/g) ?? []).join('').slice(0, 3).toUpperCase()
}

// "—" for a missing number, else the formatted value.
export function nr(v: number | null, fmt: (n: number) => string): string {
  return v == null ? '—' : fmt(v)
}

// A readable chip label for a claim's evidence anchor (e.g. "stat:gold_at_24" → "gold at 24").
export function evidenceLabel(ref: { id: string; label?: string }): string {
  return ref.label ?? ref.id.replace(/^(stat|marker):/, '').replace(/[_#]/g, ' ').trim()
}

// A stat anchor ref, minted with the exact key + label grammar of the main-side
// anchorCatalog (`stat:<key>`), so chat grounding resolves it 1:1.
export function statRef(key: string, label: string): EvidenceRef {
  return { id: `stat:${key}`, kind: 'stat', label }
}

// The ref for one player death — same id grammar the anchorCatalog mints
// (`marker:death#<n>`, 1-based n straight off the death-map dot).
export function deathRef(n: number): EvidenceRef {
  return { id: `marker:death#${n}`, kind: 'marker', label: `Death ${n}` }
}

export const DEATH_CHARACTER: Record<DeathNarration['character'], { label: string; tone: string }> = {
  caught_out: { label: 'Caught out', tone: 'var(--loss)' },
  overextended: { label: 'Overextended', tone: 'var(--warn)' },
  fair_fight: { label: 'Fair fight', tone: 'var(--text-muted)' },
  objective_trade: { label: 'Traded for an objective', tone: 'var(--gold-400)' },
  unclear: { label: 'Unclear', tone: 'var(--text-faint)' },
}

export function deathNarrationByN(narrations?: DeathNarration[]): Map<number, DeathNarration> {
  const m = new Map<number, DeathNarration>()
  for (const dn of narrations ?? []) {
    const match = /death#(\d+)/.exec(dn.ref.id)
    if (match) m.set(Number(match[1]), dn)
  }
  return m
}

// Map a factual highlight to the timeline component's event vocabulary, minting
// each event's evidence anchor with the EXACT id grammar of the main-side
// anchorCatalog: highlights numbered per bucket in report order, death-kind
// highlights counted in the "swing" bucket (`marker:objective#1`,
// `marker:teamfight#2`, `marker:swing#1`, …).
export function toTimelineEvents(hl: Highlight[]) {
  const counters: Record<string, number> = {}
  return hl.map(h => {
    const bucket = h.kind === 'death' ? 'swing' : h.kind
    const n = (counters[bucket] = (counters[bucket] ?? 0) + 1)
    const ref: EvidenceRef = { id: `marker:${bucket}#${n}`, kind: 'marker', label: h.label }
    return { t: h.tMin, kind: h.kind, label: h.label, detail: h.detail, ref }
  })
}

// --------------------------------------------------------------- pin store
export function loadPins(): string[] { try { return JSON.parse(localStorage.getItem('ck-pinned-games') || '[]') } catch { return [] } }
export function savePins(a: string[]) { try { localStorage.setItem('ck-pinned-games', JSON.stringify(a)) } catch { /* ignore */ } }
