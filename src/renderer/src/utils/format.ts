import type { RankInfo } from '@shared/types'

function titleCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s
}

/** "PLATINUM" + "II" -> "Platinum II". Apex tiers have no division. */
export function rankLabel(rank: RankInfo | null): string {
  if (!rank) return 'Unranked'
  const tier = titleCase(rank.tier)
  const apex = ['Master', 'Grandmaster', 'Challenger']
  return apex.includes(tier) ? tier : `${tier} ${rank.division}`
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Riot queueId → short human label for the match list / report. */
const QUEUE_LABELS: Record<number, string> = {
  420: 'Ranked Solo',
  440: 'Ranked Flex',
  400: 'Normal Draft',
  430: 'Normal Blind',
  450: 'ARAM',
  490: 'Quickplay',
  700: 'Clash',
  1700: 'Arena',
  1900: 'URF'
}

export function queueLabel(queueId: number): string {
  return QUEUE_LABELS[queueId] ?? 'Custom'
}

/** Relative time from an epoch-ms timestamp: "14m ago", "2h ago", "Yesterday", "3d ago". */
export function relativeTime(epochMs: number): string {
  const diffMs = Date.now() - epochMs
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}
