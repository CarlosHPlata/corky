# Phase 1 Data Model: League Client Identity Detection

**Feature**: 006-league-client-identity | **Date**: 2026-06-16

Covers the new entities, the one new table, the resolution of the existing `getCurrentAccount()` chokepoint, and the DTOs crossing IPC. Nothing existing is reshaped — every change is additive.

---

## Domain entities & value objects

### PlayerIdentity (value object — `domain/identity/playerIdentity.ts`)

The identity Corky resolves for the active player, independent of where it came from (live client or cache).

| Field | Type | Notes |
|-------|------|-------|
| `puuid` | `string` | Stable account id; the join key to all stored data. |
| `gameName` | `string` | Riot ID name part. |
| `tagLine` | `string` | Riot ID tag part. |
| `platform` | `string` | Riot platform route, e.g. `euw1` (for `summoner-v4`/`league-v4`). |
| `region` | `string` | Riot regional route, e.g. `europe` (for `account-v1`/`match-v5`). |

- `riotId` is presented as `${gameName}#${tagLine}`.
- `toAccount(): Account` produces the existing `Account` shape (no new persisted account fields).
- **Validation**: `puuid`, `gameName`, `tagLine` non-empty; `platform`/`region` must be resolvable (from the client region map, or carried from the stored account). If region can't be mapped and there's no stored value, identity is **not** activated (honest-about-limits) rather than guessed.

### ClientConnection (union — `domain/identity` / `shared/types.ts`)

The live state of Corky's link to the client.

```
type ClientConnection =
  | 'connected'    // client running, a player is logged in
  | 'loggedOut'    // client running, no player logged in (login screen)
  | 'disconnected' // no client running
  | 'unreadable'   // client running but identity could not be read (permission/parse error)
```

### ActivePlayerResolution (pure result — `domain/identity/resolution.ts`)

Output of the pure decision function `resolve({ live?, lastKnown? })`:

| Field | Type | Notes |
|-------|------|-------|
| `active` | `PlayerIdentity \| null` | The player to load; `null` ⇒ onboarding. |
| `source` | `'client' \| 'cache' \| 'none'` | Where `active` came from. |
| `switched` | `boolean` | `true` when `active.puuid` differs from the prior active puuid (drives the reload push). |

**Rules** (the testable heart):
- `live` present (logged-in) ⇒ `active = live`, `source = 'client'`.
- else `lastKnown` present ⇒ `active = lastKnown`, `source = 'cache'` (covers no-client **and** client-logged-out — both yield no `live`).
- else ⇒ `active = null`, `source = 'none'`.
- `switched = active && active.puuid !== priorActivePuuid`.
- **Keep-on-logout**: when a player was already active and the client goes `loggedOut`/`disconnected`, `lastKnown` is that same player, so `active` stays them with `source = 'cache'` — the UI never blanks out (edge case in spec).

### Domain events (`domain/events.ts` — extended)

```
| { type: 'ActivePlayerChanged'; puuid: string; source: 'client' | 'cache' }
| { type: 'ClientConnectionChanged'; connection: ClientConnection }
```

`ActivePlayerChanged` fires only when `switched` is true (or first activation). `ClientConnectionChanged` fires on every stable connection transition (drives the status chip even when the player is unchanged).

---

## Persistence

### New table: `active_player` (single-row pointer)

```sql
CREATE TABLE IF NOT EXISTS active_player (
  id         INTEGER PRIMARY KEY CHECK (id = 1),  -- enforce a single row
  puuid      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- Holds **which** account is active. The account's full identity (name/tag/platform/region) continues to live in the existing `account` table — the pointer references it by `puuid`.
- Written by `IdentityService.activate()` via `setActivePlayer(puuid)` (upsert id=1).
- Migration is additive (`CREATE TABLE IF NOT EXISTS`); existing DBs gain it empty and fall back to `LIMIT 1` until the first activation sets it. No data migration, no destructive change.

### `MatchRepository` additions (`application/ports/MatchRepository.ts`)

```
setActivePlayer(puuid: string): void
getActivePlayer(): string | null
```

### `getCurrentAccount()` resolution change (`SqliteMatchRepository`)

```
getCurrentAccount(): Account | null
  → const puuid = getActivePlayer()
  → if (puuid) return getAccount(puuid)        // active-of-many
  → return <SELECT * FROM account LIMIT 1>     // legacy fallback (pre-pointer DBs)
```

This single change flips the ~12 existing use cases from "the one account" to "the active account" **without touching their code** (they already call `getCurrentAccount()`).

### Unchanged tables

`account` (still `puuid` PK, now may hold >1 row), `matches`, `timelines`, `summoner_profile`, `lp_snapshots`, and all spec-003/004/005 tables — all already partition by `puuid`, so multi-account works with no schema change. SC-004 (zero bleed-through) holds because every read is `WHERE puuid = <active>`.

---

## DTOs crossing IPC (`shared/types.ts`)

### `ClientStatus` (renderer-facing)

```
interface ClientStatus {
  connection: ClientConnection            // 'connected' | 'loggedOut' | 'disconnected' | 'unreadable'
  source: 'client' | 'cache' | 'none'     // basis for the shown identity
  player: {                               // null ⇒ onboarding (source === 'none')
    puuid: string
    gameName: string
    tagLine: string
    platform: string
    region: string
  } | null
}
```

- The renderer renders the status chip from `connection` + `source`, the identity from `player`, and the onboarding panel when `player === null`.
- **No credential ever appears here** — the lockfile password stays in main (Principle VI).

### `IpcApi` additions

```
getClientStatus: () => Promise<ClientStatus>
onIdentityChanged: (cb: (status: ClientStatus) => void) => () => void   // returns an unsubscribe
```

`PlayerIdentity` is represented in `shared/types.ts` for the DTO; the domain VO mirrors it but lives in `domain/identity`.

---

## State transitions (active player + connection)

```
            ┌────────────────────────── client login detected ──────────────────────────┐
            │                                                                             ▼
[ none / onboarding ] ──login──▶ [ active = client player, connection=connected, source=client ]
       ▲                                   │                         │
       │ (no cache & no client)            │ logout / client close   │ different account logs in
       │                                   ▼                         ▼
[ app start ]                    [ active unchanged,        [ active = new player, switched=true,
       │                           connection=loggedOut/     ActivePlayerChanged → renderer reload ]
       │ cache present             disconnected,
       ▼                           source=cache ]  ◀── keep-on-logout (never blanks)
[ active = last-known, source=cache, connection=disconnected ]
       │
       └── client opens & logs in ──▶ (top row)   |   unreadable client ──▶ connection=unreadable, active stays cache/none
```

- **First run, no client, no cache** → `none` → onboarding; a later login transitions straight to `connected` (FR-005, US3).
- **Returning, client closed** → `cache` immediately, offline (FR-004, US2, SC-001).
- **Login while running** → `connected`, `switched` if different → `ActivePlayerChanged` → renderer re-bootstrap (FR-002/007/008, SC-002).
- **Logout / close while running** → keep last active as `cache`, only `ClientConnectionChanged` fires (edge case; UI doesn't blank).
- **Unreadable** → `connection='unreadable'`, active stays whatever it was (cache or none); honest status, no crash (FR-012).

---

## Validation & invariants

- A player is activated **only** with a complete, route-resolvable `PlayerIdentity` (FR-006); otherwise Corky stays on cache/onboarding and reports it.
- `active_player` has at most one row (CHECK id=1); switching is an upsert, never an insert-many.
- Activation is idempotent: re-detecting the same `puuid` upserts the account + pointer and does **not** emit `ActivePlayerChanged` (no `switched`), avoiding reload thrash.
- The previous player's stored rows are never deleted on switch (FR-007).
