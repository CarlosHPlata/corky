import { describe, it, expect } from 'vitest'
import { GetMatchPage } from '../../src/main/application/queries/GetMatchPage'
import type { MatchRepository, MatchPageOptions } from '../../src/main/application/ports/MatchRepository'
import type { Account, MatchSummary } from '../../src/shared/types'

// A pure in-memory fake — exercises GetMatchPage's cursor logic without the
// native SQLite module (which can't load under plain `vitest`).
function fakeRepo(matches: MatchSummary[], account: Account | null): MatchRepository {
  const sorted = [...matches].sort(
    (a, b) => b.gameCreation - a.gameCreation || (a.matchId < b.matchId ? 1 : -1)
  )
  return {
    getCurrentAccount: () => account,
    listMatchesPage: (_puuid: string, opts: MatchPageOptions) => {
      const after = sorted.filter((m) =>
        opts.beforeCreation === undefined
          ? true
          : m.gameCreation < opts.beforeCreation ||
            (m.gameCreation === opts.beforeCreation && m.matchId < (opts.beforeMatchId ?? ''))
      )
      return after.slice(0, opts.limit)
    },
    countMatches: () => sorted.length
  } as unknown as MatchRepository
}

const account: Account = {
  puuid: 'p', gameName: 'A', tagLine: 'B', platform: 'euw1', region: 'europe'
}

function mk(id: string, creation: number): MatchSummary {
  return {
    matchId: id, puuid: 'p', queue: 420, champion: 'Ahri', role: 'Mid', win: true,
    kills: 1, deaths: 1, assists: 1, cs: 1, csPerMin: 1, gold: 1, goldPerMin: 1,
    gameCreation: creation, gameDuration: 1800
  }
}

describe('GetMatchPage', () => {
  it('returns an empty page when no account is synced', () => {
    const q = new GetMatchPage(fakeRepo([], null))
    expect(q.execute({})).toEqual({ matches: [], nextCursor: null, hasMoreRemote: false })
  })

  it('returns the first page newest-first with a continuation cursor', () => {
    const all = [mk('M1', 100), mk('M2', 200), mk('M3', 300)]
    const q = new GetMatchPage(fakeRepo(all, account))
    const page = q.execute({ limit: 2 })
    expect(page.matches.map((m) => m.matchId)).toEqual(['M3', 'M2'])
    expect(page.nextCursor).not.toBeNull()
    expect(page.hasMoreRemote).toBe(false) // full page ⇒ more local may remain
  })

  it('pages with the cursor and flags local exhaustion on a short page', () => {
    const all = [mk('M1', 100), mk('M2', 200), mk('M3', 300)]
    const q = new GetMatchPage(fakeRepo(all, account))
    const p1 = q.execute({ limit: 2 })
    const p2 = q.execute({ before: p1.nextCursor, limit: 2 })
    expect(p2.matches.map((m) => m.matchId)).toEqual(['M1'])
    expect(p2.hasMoreRemote).toBe(true) // short page ⇒ local exhausted
  })

  it('treats a malformed cursor as a first page (never throws)', () => {
    const all = [mk('M1', 100), mk('M2', 200)]
    const q = new GetMatchPage(fakeRepo(all, account))
    const page = q.execute({ before: 'not-a-real-cursor', limit: 10 })
    expect(page.matches.map((m) => m.matchId)).toEqual(['M2', 'M1'])
  })

  it('clamps the limit to the 1..50 range', () => {
    const all = Array.from({ length: 80 }, (_, i) => mk(`M${i}`, i + 1))
    const q = new GetMatchPage(fakeRepo(all, account))
    expect(q.execute({ limit: 999 }).matches).toHaveLength(50)
    expect(q.execute({ limit: 0 }).matches).toHaveLength(1)
  })
})
