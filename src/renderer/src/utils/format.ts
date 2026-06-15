function titleCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s
}

/** "PLATINUM" + "II" -> "Platinum II". Apex tiers have no division. */
export function rankLabel(rank: { tier: string; division: string } | null): string {
  if (!rank) return 'Unranked'
  const tier = titleCase(rank.tier)
  const apex = ['Master', 'Grandmaster', 'Challenger']
  return apex.includes(tier) ? tier : `${tier} ${rank.division}`
}

const TIER_ORDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND']
const DIVISION_ORDER: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }

/** Tier + division + LP collapsed onto one ladder-wide scale (100 LP per
 * division, 4 divisions per tier), so a Silver I 97 → Gold IV 13 promotion
 * reads as +16, not −84. Apex tiers share one LP pool above Diamond. */
export function absoluteLp(s: { tier: string; division: string; leaguePoints: number }): number {
  const tierIdx = TIER_ORDER.indexOf(s.tier.toUpperCase())
  if (tierIdx === -1) return TIER_ORDER.length * 400 + s.leaguePoints
  return tierIdx * 400 + (DIVISION_ORDER[s.division.toUpperCase()] ?? 0) * 100 + s.leaguePoints
}

/** Inverse of absoluteLp's floor: the division a ladder-wide LP value sits in.
 * Used to label division boundaries on the LP chart. */
export function rankAtAbsoluteLp(abs: number): { tier: string; division: string } {
  const clamped = Math.max(0, abs)
  const tierIdx = Math.floor(clamped / 400)
  if (tierIdx >= TIER_ORDER.length) return { tier: 'MASTER', division: '' }
  const divIdx = Math.floor((clamped % 400) / 100)
  const division = ['IV', 'III', 'II', 'I'][divIdx]
  return { tier: TIER_ORDER[tierIdx], division }
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
