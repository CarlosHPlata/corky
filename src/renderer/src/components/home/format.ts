// Corky home screen — shared types + pure helpers used across the home cards.

import type { MatchSummary } from '@shared/types'

export type Screen = 'home' | 'history' | 'report' | 'champ' | 'trends' | 'settings'

export interface ChampStat {
  champ: string; role: string; g: number; w: number
  k: number; d: number; a: number
  wr: number; kda: string; csmin: string
}

// Aggregate a match list into per-champion stats, most-played first.
export function champPool(matches: MatchSummary[]): ChampStat[] {
  const by: Record<string, { champ: string; role: string; g: number; w: number; k: number; d: number; a: number; cs: number }> = {}
  matches.forEach(m => {
    const s = by[m.champion] || (by[m.champion] = { champ: m.champion, role: m.role, g: 0, w: 0, k: 0, d: 0, a: 0, cs: 0 })
    s.g++; if (m.win) s.w++; s.k += m.kills; s.d += m.deaths; s.a += m.assists; s.cs += m.csPerMin
  })
  return Object.values(by)
    .map(s => ({
      ...s,
      wr: Math.round((s.w / s.g) * 100),
      kda: ((s.k + s.a) / Math.max(1, s.d)).toFixed(1),
      csmin: (s.cs / s.g).toFixed(1),
    }))
    .sort((x, y) => y.g - x.g || y.wr - x.wr)
}

export function wrIntent(wr: number): 'win' | 'warn' | 'loss' {
  return wr >= 60 ? 'win' : wr >= 45 ? 'warn' : 'loss'
}
export function wrColor(wr: number): string {
  return wr >= 60 ? 'var(--win)' : wr >= 45 ? 'var(--warn)' : 'var(--loss)'
}
