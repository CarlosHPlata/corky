// Frontend-first stub data (Constitution VIII). Shapes mirror the `MatchSummary` /
// `MatchPage` DTOs in `@shared/types` exactly, so wiring the backend is a one-line
// swap in `useMatchHistory` with no UI change. Exercises a multi-page scroll plus
// the empty and final-page states.
import type { MatchSummary, MatchPage } from '@shared/types'

const CHAMPS = ['Ahri', 'Syndra', 'Viktor', 'Orianna', 'Zed', 'LeeSin', 'Jinx', 'Thresh']
const ROLES = ['Mid', 'Mid', 'Mid', 'Mid', 'Mid', 'Jungle', 'Bot', 'Support']

function stubMatch(i: number): MatchSummary {
  const win = i % 3 !== 0
  return {
    matchId: `EUW1_STUB_${String(i).padStart(3, '0')}`,
    puuid: 'PUUID_PLAYER',
    queue: 420,
    champion: CHAMPS[i % CHAMPS.length],
    role: ROLES[i % ROLES.length],
    win,
    kills: win ? 9 : 4,
    deaths: win ? 3 : 8,
    assists: 7 + (i % 5),
    cs: 200 + (i % 60),
    csPerMin: 6.5 + (i % 4) * 0.4,
    gold: 12000 + (i % 9) * 300,
    goldPerMin: 420 + (i % 9) * 8,
    // newest first: descend the creation time as i grows
    gameCreation: 1_749_000_000_000 - i * 1_800_000,
    gameDuration: 1500 + (i % 12) * 90
  }
}

/** A full local history of stub matches. */
export const STUB_MATCHES: MatchSummary[] = Array.from({ length: 47 }, (_, i) => stubMatch(i + 1))

const PAGE = 20

/** Page the stub history the same way the real `matches:page` query does. */
export function stubMatchPage(before?: string | null): MatchPage {
  const startIdx = before ? STUB_MATCHES.findIndex((m) => m.matchId === before) + 1 : 0
  const slice = STUB_MATCHES.slice(startIdx, startIdx + PAGE)
  const last = slice[slice.length - 1]
  const full = slice.length === PAGE
  return {
    matches: slice,
    nextCursor: full && last ? last.matchId : null,
    hasMoreRemote: false
  }
}

/** Empty-state page (no synced matches yet). */
export const STUB_EMPTY_PAGE: MatchPage = { matches: [], nextCursor: null, hasMoreRemote: false }
