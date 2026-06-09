import type { MatchPage, MatchPageRequest, MatchSummary } from '@shared/types'
import type { MatchRepository } from '../ports/MatchRepository'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

interface Cursor {
  gameCreation: number
  matchId: string
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.gameCreation}|${c.matchId}`, 'utf-8').toString('base64')
}

/** Defensive: a malformed cursor decodes to undefined → treated as a first page. */
function decodeCursor(raw: string | null | undefined): Cursor | undefined {
  if (!raw) return undefined
  try {
    const [creation, matchId] = Buffer.from(raw, 'base64').toString('utf-8').split('|')
    const gameCreation = Number(creation)
    if (!Number.isFinite(gameCreation) || !matchId) return undefined
    return { gameCreation, matchId }
  } catch {
    return undefined
  }
}

/**
 * One newest-first page of the player's matches for infinite scroll (US1).
 * Cursor-paged over the local DB; `nextCursor` is null once the local store is
 * exhausted, at which point `hasMoreRemote` tells the renderer it may pull an
 * older Riot window via `syncMatches(count, start)`.
 */
export class GetMatchPage {
  constructor(private readonly repository: MatchRepository) {}

  execute(req: MatchPageRequest = {}): MatchPage {
    const account = this.repository.getCurrentAccount()
    if (!account) return { matches: [], nextCursor: null, hasMoreRemote: false }

    const limit = Math.max(1, Math.min(MAX_LIMIT, req.limit ?? DEFAULT_LIMIT))
    const cursor = decodeCursor(req.before)

    const matches: MatchSummary[] = this.repository.listMatchesPage(account.puuid, {
      beforeCreation: cursor?.gameCreation,
      beforeMatchId: cursor?.matchId,
      limit
    })

    const last = matches[matches.length - 1]
    // Cursor always points at the last row we returned (so the renderer can keep
    // paging after an older-window sync); null only when the page is empty.
    const nextCursor = last
      ? encodeCursor({ gameCreation: last.gameCreation, matchId: last.matchId })
      : null

    return {
      matches,
      nextCursor,
      // A short page means the local store is exhausted ⇒ Riot may hold older games.
      hasMoreRemote: matches.length < limit
    }
  }
}
