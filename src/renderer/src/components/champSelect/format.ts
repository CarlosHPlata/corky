// Corky champ select — shared pure helpers used across the champ-select pieces.

import type { ChampSelectPlayer } from '@shared/types'

const ROLE_LABEL: Record<string, string> = {
  top: 'Top',
  jungle: 'Jungle',
  middle: 'Mid',
  bottom: 'Bot',
  utility: 'Support'
}

export function roleLabel(pos: string): string {
  return ROLE_LABEL[pos] ?? (pos ? pos[0].toUpperCase() + pos.slice(1) : '')
}

/** The champion this slot should show: locked pick, else hovered intent. */
export function championOf(p: ChampSelectPlayer): { id: number; hovered: boolean } | null {
  if (p.championId > 0) return { id: p.championId, hovered: false }
  if (p.championPickIntent > 0) return { id: p.championPickIntent, hovered: true }
  return null
}
