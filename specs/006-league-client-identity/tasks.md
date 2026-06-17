---
description: "Task list for League Client Identity Detection"
---

# Tasks: League Client Identity Detection

**Input**: Design documents from `/specs/006-league-client-identity/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included — Constitution V (Test-First) makes `domain/`/`application/` unit tests mandatory, and the external LCU client is exercised behind a **fake gateway** (spec US1 Independent Test note). Adapter edges (LCU HTTP/FS, SQLite pointer) carry the known external-dependency caveat and are verified manually per `quickstart.md`.

**Organization**: Tasks are grouped by user story. The shared **engine + spine** lives in Foundational (proven by unit tests against a `NullLeagueClientGateway`), so US2/US3 depend only on Foundational; US1 swaps in the real LCU adapter and the live reload path.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish carry no story label)
- All paths are repo-relative from `D:\projects\corky`.

## Path Conventions

Electron hexagonal layout (per `technical_brief.md`): `src/main/{domain,application,adapters,infrastructure}`, `src/preload`, `src/renderer/src`, `src/shared`, tests in `test/unit`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared types and the config change that unblocks running without a client.

- [X] T001 [P] Add identity DTOs to `src/shared/types.ts`: `PlayerIdentity`, `ClientConnection` (`'connected'|'loggedOut'|'disconnected'|'unreadable'`), `ClientStatus`, and `IpcApi` additions `getClientStatus` + `onIdentityChanged` (see [data-model.md](./data-model.md) DTOs).
- [X] T002 [P] Make identity config optional in `src/main/infrastructure/config.ts`: `RIOT_ID`/`PLATFORM`/`REGION` become `process.env.* ?? undefined` (stop throwing); expose an optional `devSeed?: { riotId; platform; region }` derived from them (research §6).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The identity engine, persistence pointer, port, service, and IPC spine — wired with a `NullLeagueClientGateway` so the app runs (offline cache / onboarding resolve) before the live LCU adapter exists. Proven by unit tests with no network.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

### Tests first (Constitution V)

- [X] T003 [P] Write `test/unit/lockfile.test.ts` — parse valid `name:pid:port:password:protocol`; reject garbled/empty input.
- [X] T004 [P] Write `test/unit/region.test.ts` — client region → `{platform, route}` table (EUW→euw1/europe, EUNE→eun1/europe, NA→na1/americas, KR→kr/asia, …); unknown → `null`.
- [X] T005 [P] Write `test/unit/identityResolution.test.ts` — `resolve({live?,lastKnown?})`: live→cache→none, `switched` flag, keep-on-logout ([data-model.md](./data-model.md) rules).

### Pure domain (the testable heart)

- [X] T006 [P] Implement `src/main/domain/identity/lockfile.ts` — pure parse of the lockfile string (no FS).
- [X] T007 [P] Implement `src/main/domain/identity/region.ts` — pure region→platform/route map + unknown fallback `null`.
- [X] T008 [P] Implement `src/main/domain/identity/playerIdentity.ts` — `PlayerIdentity` VO + `toAccount(): Account` + `riotId` getter + validation.
- [X] T009 Implement `src/main/domain/identity/resolution.ts` — pure `resolve()` decision returning `{active, source, switched}` (depends on T008).
- [X] T010 Extend `src/main/domain/events.ts` — add `ActivePlayerChanged { puuid, source }` and `ClientConnectionChanged { connection }`.

### Persistence pointer

- [X] T011 Add `active_player` table to `src/main/adapters/driven/sqlite/schema.ts` (`CREATE TABLE IF NOT EXISTS`, `CHECK (id = 1)`; additive, no destructive change).
- [X] T012 Extend `src/main/application/ports/MatchRepository.ts` — `setActivePlayer(puuid)` / `getActivePlayer(): string|null`; document `getCurrentAccount()` now resolves via the pointer.
- [X] T013 Update `src/main/adapters/driven/sqlite/SqliteMatchRepository.ts` — implement pointer methods; `getCurrentAccount()` = active pointer → `getAccount(puuid)`, else `LIMIT 1` legacy fallback (depends on T011, T012).

### Port, service, null adapter

- [X] T014 [P] Define `src/main/application/ports/LeagueClientGateway.ts` — `snapshot()`, `subscribe()`, `start()`/`stop()`, DTOs per [contracts/league-client-gateway.md](./contracts/league-client-gateway.md).
- [X] T015 [P] Add `src/main/adapters/driven/lcu/NullLeagueClientGateway.ts` — always `{ connection: 'disconnected' }`; default until US1 (also reusable as a test double) (depends on T014).
- [X] T016 Write `test/unit/IdentityService.test.ts` — fake `LeagueClientGateway` + fake repos; scenarios from [contracts/identity-service.md](./contracts/identity-service.md) (activate upserts + moves pointer, emit-once, offline fallback, switch keeps prior data, degrade-on-unreadable, dev-seed subordinate) (depends on T009, T013, T014).
- [X] T017 Implement `src/main/application/services/Identity/IdentityService.ts` — facade resolution algorithm, activation, event emission; optional account resolver (`MatchDataSource.resolveAccount`) used **only** for the dev-seed→puuid path (depends on T016 written-first, T009, T010, T013, T014).

### Use-case + IPC spine

- [X] T018 Add `src/main/application/queries/GetClientStatus.ts` — returns `ClientStatus` via `identityService.getStatus()` (depends on T017).
- [X] T019 Update `src/main/application/commands/SyncRecentMatches.ts` — drop `SyncRecentMatchesConfig`/`resolveAccount`; sync the active account from `MatchRepository.getCurrentAccount()` (depends on T013).
- [X] T020 Update `src/main/application/commands/SyncSummonerProfile.ts` — drop static config; operate on the active account from `getCurrentAccount()` (depends on T013).
- [X] T021 Update `src/main/adapters/driving/IpcController.ts` — register `identity:status` → `GetClientStatus`; add the `identity:changed` push helper (fired later by the listener) (depends on T018).
- [X] T022 Update `src/preload/index.ts` — expose `getClientStatus()` and `onIdentityChanged(cb)` (returns an unsubscribe) per [contracts/ipc-identity.md](./contracts/ipc-identity.md) (depends on T021).
- [X] T023 Update `src/main/infrastructure/container.ts` — wire `IdentityService` (inject `NullLeagueClientGateway` + optional `devSeed` + account resolver), `GetClientStatus`; construct sync commands without `riotConfig`; remove the `riotConfig` block (depends on T017, T015, T018, T019, T020).
- [X] T024 Update `src/main/index.ts` — `identityService.start()` after window-ready; `stop()` on `window-all-closed` (depends on T023).

**Checkpoint**: `npx vitest run` green for identity tests. App boots; with no client it resolves cache (legacy account row) or onboarding; `getClientStatus` returns a valid `ClientStatus`. No live detection yet (Null gateway → `disconnected`).

---

## Phase 3: User Story 1 - Corky follows whoever is logged into the League client (Priority: P1) 🎯 MVP

**Goal**: A logged-in player is detected from the live client and the whole app (re)loads for them; a login while running triggers a reload.

**Independent Test**: With the engine from Phase 2 + the LCU adapter, a fake-gateway login emits `ActivePlayerChanged` and the renderer re-bootstraps (automated, T016); manually, opening/logging into the real client flips the chip to "connected as you" and loads your data within ≤30 s (quickstart scenarios 3–5).

### Stub-first UI (Constitution VIII)

- [X] T025 [P] [US1] Create `src/renderer/src/stubs/clientStatus.ts` — a `ClientStatus` for every state (connected / cache-disconnected / loggedOut / none / unreadable) (depends on T001).
- [X] T026 [P] [US1] Build `src/renderer/src/components/ClientStatusChip.tsx` against the stub — render the **connected** state ("connected as «player»"); review before wiring (depends on T025).

### LCU adapter (the live read — first real client integration)

- [X] T027 [P] [US1] Implement `src/main/adapters/driven/lcu/lockfileSource.ts` — locate + read the lockfile (FS/watch), delegate parsing to `domain/identity/lockfile` (depends on T006).
- [X] T028 [P] [US1] Implement `src/main/adapters/driven/lcu/lcuHttp.ts` — loopback HTTPS helper accepting the self-signed cert **scoped to `127.0.0.1`**, Basic auth `riot:<password>` (password stays in main; Principle VI).
- [X] T029 [US1] Implement `src/main/adapters/driven/lcu/LcuLeagueClientGateway.ts` — `snapshot()`/`subscribe()` via `current-summoner` + `region-locale` + region map; lockfile-watch + ~3–5 s poll; debounced stable transitions; maps not-ready→`loggedOut`, errors→`unreadable` (depends on T014, T027, T028, T007).

### Live reload path

- [X] T030 [US1] Implement `src/main/adapters/driving/LcuEventListener.ts` — subscribe the gateway → drive `IdentityService` → on `ActivePlayerChanged`/`ClientConnectionChanged` push `identity:changed` (fresh `ClientStatus`) to the focused `webContents` (depends on T017, T029, T021).
- [X] T031 [US1] Update `src/main/infrastructure/container.ts` — replace `NullLeagueClientGateway` with `LcuLeagueClientGateway`; construct `LcuEventListener` (depends on T023, T029, T030).
- [X] T032 [US1] Update `src/main/index.ts` — bind `LcuEventListener` to the window's `webContents`; start it after window-ready (depends on T031, T024).
- [X] T033 [US1] Create `src/renderer/src/data/useClientStatus.ts` — load `getClientStatus()` on mount + subscribe via `onIdentityChanged`; returns `{ status }` (depends on T022).
- [X] T034 [US1] Update `src/renderer/src/data/useAppData.ts` — subscribe to `onIdentityChanged`; when it fires with `source !== 'none'`, re-run `refresh()` + `sync()` (the "reload the entire app for that player"; no `win.reload()`) (depends on T022).
- [X] T035 [US1] Update `src/renderer/src/App.tsx` — mount `ClientStatusChip` driven by `useClientStatus` (depends on T026, T033).

**Checkpoint**: Real client login (re)loads the app for that player and shows the connected chip; switching accounts switches data with zero bleed-through (SC-002, SC-004; FR-002/006/007/008).

---

## Phase 4: User Story 2 - Corky opens with the last known player when the client isn't available (Priority: P2)

**Goal**: With the client closed or logged out, the app shows the last-known player's data offline and an honest "last session" status; logging out while running never blanks the view.

**Independent Test**: Client closed with a prior player → app loads that player's overview offline, no prompt (quickstart 1); logout while running keeps the view (quickstart 6). Depends only on the Phase 2 engine + the status surface introduced in US1.

- [X] T036 [US2] Extend `src/renderer/src/components/ClientStatusChip.tsx` against the stub — render `disconnected`/`loggedOut` with `source:'cache'` as "showing your last session — client not detected" (depends on T026).
- [X] T037 [US2] Verify/adjust `src/renderer/src/data/useAppData.ts` + `useClientStatus.ts` — on startup with `source:'cache'`, the cached player's overview loads from the DB with no network; an `onIdentityChanged` to `loggedOut`/`disconnected` keeps the active player (no blank) (depends on T033, T034).
- [ ] T038 [US2] Manual verification per `quickstart.md` scenarios 1 (offline cached, <3 s, SC-001) and 6 (logout keeps offline view) (depends on T037).

**Checkpoint**: US1 **and** US2 both work — live detection when available, graceful last-known offline view when not (FR-004, US2; edge: keep-on-logout).

---

## Phase 5: User Story 3 - A new user is guided to connect their client (Priority: P3)

**Goal**: Fresh machine, nothing cached, no client → clear onboarding guidance and **no** fabricated identity; auto-loads the player once they log in.

**Independent Test**: Fresh DB + client closed → onboarding panel, no placeholder identity (quickstart 2); then log in → app loads automatically (quickstart 3). Depends only on Phase 2 + the status surface.

- [X] T039 [P] [US3] Build `src/renderer/src/components/ConnectClientPanel.tsx` against the stub — onboarding empty-state ("open and log into the League client") for `source:'none'` (depends on T025).
- [X] T040 [US3] Update `src/renderer/src/App.tsx` — when `status.player === null` (`source:'none'`) render `ConnectClientPanel` instead of the data screens; auto-leave when an `onIdentityChanged` brings a player (depends on T035, T039).
- [X] T041 [US3] Verify cold-start shows **no** fabricated/hard-coded identity when there is no seed, cache, or client (FR-005) — confirm `config.ts`/`container.ts` never inject a placeholder (depends on T002, T023).
- [ ] T042 [US3] Manual verification per `quickstart.md` scenarios 2 (onboarding) and 3 (login from onboarding) (depends on T040).

**Checkpoint**: All three stories independently functional — live, offline-cached, and onboarding.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T043 [P] Principle VI review — confirm the LCU lockfile password never appears on a DTO or crosses `preload` (review `src/main/adapters/driven/lcu/*` + `src/preload/index.ts`).
- [X] T044 Region-edge handling — confirm an unknown client region falls back to the stored platform/region (or stays un-activated with honest status), never guesses (FR-006); covered by `region.test.ts` + a manual non-EUW check (quickstart 4).
- [ ] T045 [P] Run the full `quickstart.md` scenario matrix (1–7) on a real Windows + client setup; record results.
- [X] T046 [P] Run `npx vitest run` (all green), `npm run build`/typecheck, and lint; confirm `better-sqlite3` ABI caveat is the only skipped suite.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: no dependencies.
- **Foundational (P2)**: depends on Setup — **blocks all stories**. Delivers the engine + spine (Null gateway).
- **US1 (P3)**: depends on Foundational — swaps in the LCU adapter + live reload path. **MVP**.
- **US2 (P4)** and **US3 (P5)**: depend on Foundational; both also consume the renderer status surface (`useClientStatus`, `App` mount) introduced in US1 — so schedule after US1, though their behaviors (offline cache / onboarding) are independently demonstrable.
- **Polish (P6)**: after the targeted stories.

### Within Foundational

- Tests T003–T005 before/with their impls T006–T009.
- T008 → T009 (resolution needs the VO). T011+T012 → T013. T014 → T015/T016/T017. T016 (test) before/with T017. T017 → T018, T021. T013 → T019/T020. T021 → T022. All → T023 → T024.

### Within US1

- T027/T028 → T029. T017+T029+T021 → T030. T029/T030 → T031 → T032. T022 → T033/T034. T026+T033 → T035.

### Parallel opportunities

- **Setup**: T001 ∥ T002.
- **Foundational tests**: T003 ∥ T004 ∥ T005.
- **Foundational pure domain**: T006 ∥ T007 ∥ T008 (then T009).
- **Port/null**: T014 then T015 (and T014 ∥ the domain files).
- **US1**: T025 ∥ T026 (UI) run alongside T027 ∥ T028 (adapter); they converge at T029/T035.
- **Polish**: T043 ∥ T045 ∥ T046 (T044 is US1-tied).

---

## Parallel Example: Foundational pure domain

```bash
# After the test files (T003–T005) are written, implement the pure modules in parallel:
Task: "Implement src/main/domain/identity/lockfile.ts"
Task: "Implement src/main/domain/identity/region.ts"
Task: "Implement src/main/domain/identity/playerIdentity.ts"
# then (serial, needs playerIdentity):
Task: "Implement src/main/domain/identity/resolution.ts"
```

## Parallel Example: User Story 1 start

```bash
# UI (stub-first) and the LCU adapter have no shared files — run together:
Task: "Create src/renderer/src/stubs/clientStatus.ts"
Task: "Build src/renderer/src/components/ClientStatusChip.tsx (connected state)"
Task: "Implement src/main/adapters/driven/lcu/lockfileSource.ts"
Task: "Implement src/main/adapters/driven/lcu/lcuHttp.ts"
```

---

## Implementation Strategy

### MVP first (Setup + Foundational + US1)

1. Phase 1 Setup → Phase 2 Foundational (engine proven by unit tests, app runs offline/onboarding).
2. Phase 3 US1 — wire the real LCU adapter + live reload.
3. **STOP and VALIDATE**: log into the client → app reloads for that player (quickstart 3–5). This is a shippable MVP: identity is real, not configured.

### Incremental delivery

1. Foundation → US1 (live detection) — MVP.
2. US2 (offline last-known) — graceful client-closed experience.
3. US3 (onboarding) — clean first run.
4. Polish — compliance review + full quickstart matrix.

---

## Notes

- `[P]` = different files, no incomplete dependencies. `[Story]` maps to spec user stories.
- **Constitution V**: pure `domain/identity/*` and `IdentityService` are unit-tested (fake gateway, no network). LCU HTTP/FS + SQLite pointer are adapter edges with the carried external-dependency/ABI caveat — verified manually (quickstart).
- **Constitution VIII**: every renderer task builds against `stubs/clientStatus.ts` first; wiring swaps the stub import for `window.api.*` with no layout change.
- **Compliance (Principle I/VI)**: the client is read only for the player's own identity/region; the lockfile password stays in the main process.
- The change is additive and backward-compatible: `active_player` is new, `getCurrentAccount()` keeps its signature (pointer + `LIMIT 1` fallback), and `RIOT_ID` becoming optional still lets an existing `.env` seed dev runs.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
