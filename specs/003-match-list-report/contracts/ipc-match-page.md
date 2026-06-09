# Contract: `matches:page` — paged match list (US1)

Read-only query for infinite scroll. Pages over the **local DB**; does not fetch from Riot itself (the renderer triggers an older-window sync separately when the local store is exhausted).

## IPC channel
`matches:page` (invoke/handle), thin handler → `GetMatchPage.execute(req)`.

## Preload signature (`IpcApi`)
```ts
getMatchPage: (req: MatchPageRequest) => Promise<MatchPage>
```

## Request
```ts
interface MatchPageRequest {
  before?: string | null   // opaque cursor from a previous MatchPage.nextCursor; omitted/null ⇒ first page
  limit?: number           // default 20 (clamped 1..50)
}
```

## Response
```ts
interface MatchPage {
  matches: MatchSummary[]   // newest-first
  nextCursor: string | null // null ⇒ no more local rows
  hasMoreRemote: boolean    // Riot may hold older unsynced games
}
```

## Behaviour
- First call (`before` absent) returns the newest `limit` stored matches + a cursor.
- Subsequent calls with `nextCursor` return the next older `limit`, never overlapping or skipping (cursor = `{gameCreation, matchId}` of the last row; FR-005).
- `nextCursor: null` when the local store has no older rows. If `hasMoreRemote` is true, the renderer may call `syncMatches(count, start)` to pull an older window, then page again.
- No account synced yet ⇒ `{ matches: [], nextCursor: null, hasMoreRemote: false }` (empty state, FR-007).
- Pure local read ⇒ works offline (Constitution VII).

## Errors
- Malformed cursor ⇒ treat as first page (defensive; never throw to the renderer).

## Related extension — older-window fetch
`matches:sync` (existing) gains an optional `start`:
```ts
syncMatches: (count: number, start?: number) => Promise<void>
```
`MatchDataSource.listMatchIds(puuid, region, count, start?)` passes `start` to match-v5 (`?start=&count=`). `SyncRecentMatches` remains idempotent (skips stored IDs). Used only when scrolling past everything stored (FR-009).
