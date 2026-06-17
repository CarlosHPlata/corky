# Implementation Plan: League Client Identity Detection

**Branch**: `006-league-client-identity` | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-league-client-identity/spec.md`

## Summary

Replace Corky's static identity (the hard-coded `RIOT_ID` / `PLATFORM` / `REGION` env vars) with **identity detected from the running League of Legends client**. When a player is logged into the client, Corky resolves *who* they are (Riot ID + a stable account id + region/platform) from the client and (re)loads the whole app around them. When the client is closed or logged out, Corky falls back to the **last-known active player** persisted locally and runs fully offline; with nothing known and no client, it shows onboarding guidance instead of a fabricated identity.

This is also Corky's **first local-client integration**, so the connection is built as a **reusable layer** that later client-aware features (champ select, rune import, in-game feed) attach to without rework.

**Requested architecture (from the user).** The client connection flows through a dedicated **service facade** in `application/services/`, mirroring the existing `MatchService` precedent:

```
command / query  ──▶  IdentityService (facade)  ──▶  LeagueClientGateway (port)  ◀── implemented by  LcuLeagueClientGateway (driven adapter)
```

**Technical approach** — net-new logic concentrates in:

- A **`LeagueClientGateway`** port (`application/ports/`) — the framework-free interface for reading the local client: current logged-in summoner, connection/login state, and a subscription for login/logout/start/stop transitions. The LCU specifics (lockfile auth, self-signed cert, REST/WS) live entirely behind it.
- An **`LcuLeagueClientGateway`** driven adapter (`adapters/driven/lcu/`) — the scaffolded client layer: lockfile discovery + parse, Basic-auth HTTPS to `127.0.0.1`, `lol-summoner/v1/current-summoner` for identity, `riotclient/region-locale` for region→platform/route mapping, and login-state change detection (poll now, WebSocket-ready). Deliberately a thin, reusable transport other features will extend.
- An **`IdentityService`** facade (`application/services/Identity/`) — the only place that resolves the **active player**: live client → persisted last-known player → none. It activates a detected player (upserts the account + moves the active pointer), keeps the existing `getCurrentAccount()` chokepoint correct, emits an `ActivePlayerChanged` domain event on switch, and degrades gracefully when the client is unreadable. Pure orchestration, no SDK imports.
- **Pure domain helpers** (`domain/identity/`) — lockfile string parsing, region→platform/route mapping, and the active-player resolution decision (live/cache/none, switch/keep) — the **testable heart**, table-tested with no I/O.
- A thin **driving listener** (`adapters/driving/LcuEventListener.ts`) that subscribes the gateway and drives `IdentityService`, plus an IPC **push** (`identity:changed`) that tells the renderer to re-run its bootstrap. A **`GetClientStatus`** query exposes connection + active player + source to the UI.
- New persistence: a single-row **`active_player`** pointer (which account is active) so multi-account data — already partitioned by `puuid` everywhere — resolves to the right player and survives restarts. The sync commands stop calling `resolveAccount` in the hot path and read the active account instead.
- Renderer (Constitution VIII, stub-first): a **connection-status chip** and a **first-run onboarding panel**, built against `stubs/clientStatus.ts` across all states, then wired 1:1 to `getClientStatus()` + `onIdentityChanged()`. `useAppData` re-runs on the identity-changed push.

## Technical Context

**Language/Version**: TypeScript 5.8, Node ≥22 (Electron 35 main), React 18 (renderer)
**Primary Dependencies**: existing only — `better-sqlite3`, native `fetch`/`https`, `ws` (already present transitively for LCU WS, else polling-only needs nothing new). **No new runtime dependency required for the MVP polling path.** (A WebSocket upgrade later may use the bundled `ws`; flagged in research, not required now.)
**Storage**: SQLite (existing DB). **One new single-row table** (`active_player`) — a pointer to the active `puuid`. No existing table reshaped; `account`, `matches`, `summoner_profile`, `lp_snapshots` are already `puuid`-partitioned.
**Identity source**: local League Client (LCU) over loopback, lockfile-authenticated. Match/rank **data** still comes from the existing Riot Web API pipeline — this feature changes *who*, not *how data is fetched*.
**Testing**: Vitest, existing `test/unit` + `test/fixtures` layout. Pure `domain/identity/*` (lockfile parse, region map, resolution decision) and the `IdentityService` (fake gateway + fake repos) are table-tested with no network. The live LCU adapter has an external dependency and is **not** unit-tested against a real client (mirrors the spec's US1 note and the carried SQLite-ABI caveat); it is exercised behind a fake gateway.
**Target Platform**: Windows desktop (Electron); renderer is a local React SPA.
**Project Type**: Electron desktop app, hexagonal main process; React renderer outside the hexagon.
**Performance Goals**: Cold start with a cached player shows the overview in <3 s offline (SC-001), unchanged from today. Live login detection reflects within ≤30 s (SC-002) — satisfiable by a few-second lockfile/identity poll. Activation triggers the existing sync; no added heavy work.
**Constraints**: identity is client-first with last-known fallback (FR-001/004/011); no fabricated identity on cold start (FR-005); region/platform derived from client (FR-006); graceful degradation when unreadable (FR-012); player-own-info only (FR-013, Principle I); secrets/local-credential stay in main (Principle VI); reusable layer (FR-014); all carried constitution gates.
**Scale/Scope**: single user, multiple accounts partitioned by `puuid`. New: 1 port (`LeagueClientGateway`), 1 driven adapter (LCU) + helpers, 1 service facade (`IdentityService`), 1 small persistence pointer (+ port methods), 1 query (`GetClientStatus`), 1 driving listener, 1 IPC push channel + 1 status channel, 3 pure domain modules, `domain/events.ts` extension. Sync commands lose their static `riotConfig`. Renderer: 1 stub, 1 status chip, 1 onboarding panel, `useAppData` re-bootstrap on push.

### Carried caveats

- **`better-sqlite3` ABI** (specs 003–005): repository tests may not run under plain `npm test` (Electron-ABI build needed). The new `active_player` pointer is trivial; its logic is covered by the pure resolution tests.
- **LCU is an external, stateful dependency**: it cannot be exercised in CI. Per the spec's US1 Independent Test note, all automated coverage runs the resolution + service logic behind a **fake `LeagueClientGateway`**; real-client behaviour is verified manually (quickstart).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Principle IV — Hexagonal Architecture**: The LCU transport lives in `adapters/driven/lcu/` behind the new `LeagueClientGateway` port (`application/ports/`). `IdentityService` is a framework-free facade in `application/services/` (same pattern as `MatchService`) depending only on ports + domain. The active-player pointer is a port method on `MatchRepository` implemented by the SQLite adapter. `GetClientStatus` is a query; the client→reload push is a thin `adapters/driving/` listener forwarding a `shared/` DTO. `domain/`/`application/` import no `electron`, `better-sqlite3`, LCU, or SDK.
- [x] **Principle VI — Secrets in Main Process**: The LCU **lockfile password** is a local credential and stays entirely in the main process (read by the adapter, never serialized to preload/renderer). The renderer receives only identity/status DTOs. No key crosses `contextBridge`.
- [x] **Principle VIII — Frontend First**: New `stubs/clientStatus.ts` enumerates every state (connected-as-X, showing-last-session, client-not-detected/onboarding, read-error). The status chip + onboarding panel are built and reviewed against stubs **before** any IPC/LCU wiring; wiring swaps the stub import for `window.api.getClientStatus()` + `onIdentityChanged` with no layout change.
- [x] **Principle V — Test-First**: `lockfile.test.ts` (parse valid/garbled), `region.test.ts` (region→platform/route table + unknown fallback), `identityResolution.test.ts` (live→cache→none, switch vs keep-on-logout, unreadable→degrade), and `IdentityService.test.ts` (fake gateway + fake repos: activation upserts account + moves pointer, emits event once, offline fallback). All fixture/fake-backed, no network.
- [x] **Principle VII — Offline-First**: Last-known player, overview, and reports load from the local DB with no client and no network (FR-004). Only **live** detection needs the client; all grounding reads stored data. The existing offline match/report behaviour is preserved.

**Constitution-specific notes carried into design**

- **Principle I (player-first / compliance)**: the client is read **only** for the player's own identity and own region — information the player already sees in their own client. No opponent data, no game memory, no injection.
- **Principle VI nuance**: the LCU password is not an API key but is still a credential; it is treated with the same "main-process only" rule.
- **Honest about limits**: an unreadable client or a never-synced detected player yields an honest status ("couldn't read client" / "couldn't sync yet"), never a crash or a fabricated identity (FR-005/FR-012).

## Project Structure

### Documentation (this feature)

```text
specs/006-league-client-identity/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — LCU access (lockfile/REST/WS vs poll), region mapping, active-player model, reload push, env deprecation
├── data-model.md        # Phase 1 — PlayerIdentity, ClientStatus, active_player table, getCurrentAccount resolution, DTOs
├── quickstart.md        # Phase 1 — stub-first build/verify walkthrough incl. manual real-client check
├── contracts/           # Phase 1
│   ├── league-client-gateway.md   # LeagueClientGateway port: methods, DTOs, connection states, subscription, error contract
│   ├── identity-service.md        # IdentityService facade: resolution rules, activation, events, status
│   └── ipc-identity.md            # identity:status query + identity:changed push; sync-command identity change
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
  main/
    domain/
      identity/
        playerIdentity.ts          # NEW — PlayerIdentity value object (riotId parts, puuid, region, platform) + toAccount()
        lockfile.ts                # NEW — pure parse of the lockfile string "name:pid:port:password:protocol"
        region.ts                  # NEW — pure map: client region (e.g. "EUW") → platform (euw1) + regional route (europe); unknown→null
        resolution.ts              # NEW — pure decision: given {liveIdentity?, lastKnown?} → {active, source, switched} (live→cache→none; keep-on-logout)
      events.ts                    # EDIT — add ActivePlayerChanged + ClientConnectionChanged domain events
    application/
      ports/
        LeagueClientGateway.ts     # NEW — read current summoner, connection/login state, subscribe(onChange); never throws past a typed Disconnected result
        MatchRepository.ts         # EDIT — add setActivePlayer(puuid) / getActivePlayer(): string|null; getCurrentAccount() resolves via the pointer
      services/
        Identity/
          IdentityService.ts       # NEW — facade: getActivePlayer(), getStatus(), refreshFromClient(), start(); resolves live→cache→none, activates, emits events
      queries/
        GetClientStatus.ts         # NEW — returns ClientStatus DTO (connection, activePlayer|null, source) via IdentityService
      commands/
        SyncRecentMatches.ts       # EDIT — drop static riotConfig/resolveAccount; sync the active account (puuid/region from IdentityService/getCurrentAccount)
        SyncSummonerProfile.ts     # EDIT — same: operate on the active account, no static config
    adapters/
      driven/
        lcu/
          LcuLeagueClientGateway.ts # NEW — implements LeagueClientGateway: lockfile discovery, Basic-auth https to 127.0.0.1, current-summoner, region-locale, poll/WS change detection
          lockfileSource.ts         # NEW — locate + read the lockfile (fs/watch); delegates parsing to domain/identity/lockfile
          lcuHttp.ts                # NEW — tiny loopback https helper (self-signed cert allowance scoped to 127.0.0.1)
        sqlite/
          SqliteMatchRepository.ts  # EDIT — active_player pointer methods; getCurrentAccount() = active pointer → account row, else LIMIT 1 fallback
          schema.ts                 # EDIT — CREATE TABLE active_player (single row); no destructive change
      driving/
        LcuEventListener.ts         # NEW — subscribes the gateway → drives IdentityService; on ActivePlayerChanged, forwards identity:changed to the renderer
        IpcController.ts            # EDIT — register identity:status; wire the identity:changed push to webContents
    infrastructure/
      container.ts                  # EDIT — wire gateway, IdentityService, listener, GetClientStatus; sync commands no longer take riotConfig
      config.ts                     # EDIT — RIOT_ID/PLATFORM/REGION become OPTIONAL dev seed (no longer required); detection takes precedence
    index.ts                        # EDIT — start the LcuEventListener / IdentityService after the window is ready
  preload/
    index.ts                        # EDIT — expose getClientStatus() + onIdentityChanged(cb) (ipcRenderer.on)
  shared/
    types.ts                        # EDIT — PlayerIdentity, ClientStatus, ClientConnection union; IpcApi += getClientStatus/onIdentityChanged
  renderer/src/
    stubs/
      clientStatus.ts               # NEW — every connection/identity state (Constitution VIII)
    data/
      useClientStatus.ts            # NEW — load status + subscribe to onIdentityChanged
      useAppData.ts                 # EDIT — re-run bootstrap when identity changes (subscribe to the push)
    components/
      ClientStatusChip.tsx          # NEW — sidebar/topbar status ("connected as X" / "last session — client not detected")
      ConnectClientPanel.tsx        # NEW — first-run onboarding empty-state (open & log into the client)
    App.tsx                         # EDIT — mount status chip; show ConnectClientPanel when source === 'none'

test/
  unit/
    lockfile.test.ts               # NEW — parse valid / malformed lockfile strings
    region.test.ts                 # NEW — region→platform/route table + unknown fallback
    identityResolution.test.ts     # NEW — live/cache/none, switch vs keep-on-logout
    IdentityService.test.ts        # NEW — fake gateway + fake repos: activate, emit-once, offline fallback, degrade-on-unreadable
```

**Structure Decision**: Follows the fixed hexagonal layout from `technical_brief.md`, and adds the **service-facade layer the user requested** under the established `application/services/` precedent (`MatchService`). All client I/O rides the new `LeagueClientGateway` port/adapter pair; the single write path for "who is active" is `IdentityService`; the testable heart is the pure `domain/identity/*` modules. Renderer work is stub-first per Constitution VIII. The change is **additive** — `getCurrentAccount()` keeps its signature (now pointer-backed) so the ~12 existing use cases that read it are untouched.

## Complexity Tracking

> No constitution violations. The new layer is intentional and matches the existing `services/` precedent; recorded here only for transparency.

| Decision | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|--------------------------------------|
| Add an `IdentityService` facade between use cases and the `LeagueClientGateway` port | User-requested layering; concentrates active-player resolution (live→cache→none, switch/keep, activation, event emission) in one framework-free place instead of scattering it across commands/queries | Calling the gateway directly from each use case was rejected: it would duplicate the resolution/fallback rules in every sync/query, leak client-connection concerns across the application layer, and make the offline/degrade behaviour hard to test in one spot. The facade matches `MatchService` and is the single seam future client features extend. |
| Keep `getCurrentAccount()` and back it with an `active_player` pointer | ~12 use cases already resolve identity through this one method; routing the active pointer through it is the lowest-ripple way to switch from "one account" to "active of many" | Threading an explicit `Account` parameter through every command/query was rejected as a large, risky refactor for no behavioural gain; the pointer preserves the existing seam and stays backward-compatible (LIMIT 1 fallback for legacy DBs). |
