# Quickstart: League Client Identity Detection

**Feature**: 006-league-client-identity | **Date**: 2026-06-16

How to build and verify this feature in the mandated order: **pure heart → stub UI → wire backend → manual real-client check**. Follows Constitution V (test-first) and VIII (frontend-first).

## Prerequisites

- Existing dev setup runs (`npm run dev`).
- For the **manual** live check only: a Windows machine with the League client installed and a Riot account to log into. All other steps run without the client.

## Build order

### 1. Pure domain heart first (Constitution V) — no UI, no client

Implement and table-test, in this order, before any adapter:

1. `domain/identity/lockfile.ts` → `lockfile.test.ts` (parse `name:pid:port:password:protocol`; reject garbled input).
2. `domain/identity/region.ts` → `region.test.ts` (EUW→euw1/europe, NA→na1/americas, KR→kr/asia, …; unknown→null).
3. `domain/identity/playerIdentity.ts` (VO + `toAccount()`).
4. `domain/identity/resolution.ts` → `identityResolution.test.ts` (live→cache→none; `switched`; keep-on-logout).
5. `domain/events.ts` += `ActivePlayerChanged` / `ClientConnectionChanged`.

```bash
npx vitest run test/unit/lockfile.test.ts test/unit/region.test.ts test/unit/identityResolution.test.ts
```

### 2. Persistence pointer

6. `schema.ts` += `active_player` table (`CREATE TABLE IF NOT EXISTS`, CHECK id=1).
7. `MatchRepository` += `setActivePlayer` / `getActivePlayer`; `SqliteMatchRepository.getCurrentAccount()` resolves pointer → account row, else `LIMIT 1`.

### 3. Service facade + its tests (behind a fake gateway)

8. `application/ports/LeagueClientGateway.ts` (interface only).
9. `application/services/Identity/IdentityService.ts`.
10. `IdentityService.test.ts` with a **fake** `LeagueClientGateway` + fake repos — script every snapshot sequence from `contracts/identity-service.md`.

```bash
npx vitest run test/unit/IdentityService.test.ts
```

### 4. Stub the UI (Constitution VIII) — before any LCU wiring

11. `shared/types.ts` += `PlayerIdentity`, `ClientStatus`, `ClientConnection`, `IpcApi.getClientStatus/onIdentityChanged`.
12. `stubs/clientStatus.ts` — one `ClientStatus` per state (connected / cache-disconnected / none / unreadable).
13. `ClientStatusChip.tsx` + `ConnectClientPanel.tsx`, mounted in `App.tsx` against the stub. Review **all** states by swapping the stub value.

```bash
npm run dev   # eyeball each state from the stub; get sign-off before step 5
```

### 5. Wire the backend (no UI change)

14. `GetClientStatus` query; register `identity:status`; add the `identity:changed` push in `LcuEventListener`.
15. Preload: `getClientStatus` + `onIdentityChanged`.
16. `useClientStatus.ts`; `useAppData.ts` re-bootstrap on the push; `App.tsx` gates onboarding on `source === 'none'`.
17. `LcuLeagueClientGateway` + `lockfileSource.ts` + `lcuHttp.ts`.
18. `config.ts`: make `RIOT_ID`/`PLATFORM`/`REGION` optional; container wires `IdentityService` (with optional dev seed), `LcuEventListener`, drops `riotConfig` from the sync commands; `index.ts` starts the service after window-ready.

> Wiring swaps the stub import for `window.api.*` only — the layout from step 4 must not change.

## Verify

### Automated (no network/client)

```bash
npx vitest run
```
Pure identity tests + `IdentityService` (fake gateway) are green. (Repository/LCU adapter edges carry the known external-dependency caveat and are not in CI.)

### Manual scenarios

| # | Setup | Expect |
|---|-------|--------|
| 1 (US2/SC-001) | Client **closed**, a player previously detected | App opens straight to that player's overview, offline, <3 s, no prompt. |
| 2 (US3/FR-005) | Fresh DB (delete the SQLite file), client **closed** | `ConnectClientPanel` onboarding; **no** placeholder/hard-coded identity. |
| 3 (US1/SC-002) | App already open on onboarding/cache; **open client & log in** | Within ~30 s the chip flips to "connected as «you»" and the app loads your data — no manual refresh/restart. |
| 4 (FR-006) | Log into an account on a non-EUW shard | Matches/rank fetch from the correct server (platform/region came from the client). |
| 5 (FR-007/SC-004) | Log out of A, log into **B** | App switches to B; A's data is untouched (log back into A → A's data still there). |
| 6 (edge) | While showing A, **close the client** | App keeps A's offline view; chip shows "client not detected". |
| 7 (FR-012) | Start the client, stay on the **login screen** | Chip shows logged-out/last-session; no crash, no fabricated identity. |

## Rollback / safety

- The change is additive: `active_player` is a new table, `getCurrentAccount()` keeps its signature with a `LIMIT 1` fallback, and `RIOT_ID` becoming optional is backward compatible (an existing `.env` still seeds dev). Reverting the feature leaves stored per-`puuid` data intact.
