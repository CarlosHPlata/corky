# Contract: `IdentityService` facade

**Feature**: 006-league-client-identity | **Layer**: `application/services/Identity/IdentityService.ts`

The facade the user asked for: **command/query → `IdentityService` → `LeagueClientGateway` port → LCU adapter.** It is the single place that resolves the **active player** and the only writer of the active pointer. Framework-free (same rules as `MatchService`): depends on ports + domain only, never imports `electron`, `better-sqlite3`, LCU, or any SDK.

## Dependencies (constructor-injected)

- `LeagueClientGateway` — live client reads + subscription.
- `MatchRepository` — `upsertAccount`, `getCurrentAccount`, `getActivePlayer`, `setActivePlayer`.
- `EventBus` (`domain/events`) — emit `ActivePlayerChanged` / `ClientConnectionChanged`.
- `devSeed?: { riotId; platform; region }` — optional env seed (subordinate to cache; see research §6). May resolve a `puuid` lazily via the Riot account source only when used.

## API

```ts
export interface IdentityService {
  /** Begin listening to the client; resolves + activates the initial player. Idempotent. */
  start(): Promise<void>
  stop(): void

  /** The player the app should currently load (active-of-many), or null ⇒ onboarding. */
  getActivePlayer(): PlayerIdentity | null

  /** Renderer-facing status: connection + source + player (null ⇒ onboarding). */
  getStatus(): ClientStatus

  /** Force a re-read from the client and re-resolve (used on demand / tests). */
  refreshFromClient(): Promise<void>
}
```

## Resolution algorithm

On `start()` and on every gateway `onChange`:

1. Read the latest `ClientSnapshot` (from the event or `gateway.snapshot()`).
2. Build `live?: PlayerIdentity`:
   - `connection === 'connected'` with `summoner` → `live = { ...summoner, platform, region }`.
     - If `platform`/`region` absent (unknown region) → reuse the stored account's `platform`/`region` for that `puuid`; if none, **do not** set `live` (cannot route) and treat as no live identity.
3. Build `lastKnown?: PlayerIdentity` from `getCurrentAccount()` (active pointer → account row).
4. `resolution = resolve({ live, lastKnown })` (pure `domain/identity/resolution.ts`).
5. If `resolution.active`:
   - `upsertAccount(active.toAccount())` then `setActivePlayer(active.puuid)` (idempotent; persists the latest identity even on same-player re-detect).
   - If `resolution.switched` (or first activation this run) → emit `ActivePlayerChanged { puuid, source }`.
6. If `snapshot.connection` changed since last emit → emit `ClientConnectionChanged { connection }`.
7. Cache the new `ClientStatus` for `getStatus()`.

**Invariants**
- Activates **only** a complete, route-resolvable identity (FR-006); otherwise leaves the active player untouched and reports `connection` honestly (FR-005/FR-012).
- Same-`puuid` re-detect upserts but does **not** emit `ActivePlayerChanged` (no reload thrash).
- Never deletes the previous player's data on switch (FR-007).
- The dev seed is consulted **only** when both `live` and `lastKnown` are absent (research §6) — it can never override a real player.

## Events → reload

`ActivePlayerChanged` is consumed by `adapters/driving/LcuEventListener.ts`, which calls `GetClientStatus` and pushes `identity:changed` to the renderer (see `ipc-identity.md`). `ClientConnectionChanged` is pushed the same way so the status chip updates even when the player is unchanged. The service itself stays renderer-agnostic (Principle IV).

## Consumers

- **`GetClientStatus`** query → `identityService.getStatus()`.
- **`SyncRecentMatches` / `SyncSummonerProfile`** → operate on the active account from `getCurrentAccount()` (no static `riotConfig`, no per-sync `resolveAccount`).
- **All existing use cases** reading `getCurrentAccount()` → automatically see the active player (no code change).

## Tests (`IdentityService.test.ts`, fake gateway + fake repos)

- disconnected + cached → `active = cache`, `source='cache'`, no `ActivePlayerChanged`.
- disconnected + no cache → `active = null`, `source='none'`.
- login(A) from cache(A) → upsert + pointer set, **no** `ActivePlayerChanged` (same puuid).
- login(B) while active(A) → pointer → B, `ActivePlayerChanged{B}`, A's data intact.
- connected, region unknown, stored platform/region exist → activates with stored routing.
- connected, region unknown, no stored routing → not activated; status `connected` but active stays prior/none.
- connected → loggedOut while active(A) → keep A as `cache`, only `ClientConnectionChanged`.
- unreadable → active unchanged, `connection='unreadable'`, no throw.
- dev seed present, no client, no cache → seed activated; then login(A) overrides seed.
