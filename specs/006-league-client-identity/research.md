# Phase 0 Research: League Client Identity Detection

**Feature**: 006-league-client-identity | **Date**: 2026-06-16

This resolves the unknowns behind the plan: how to read identity from the local League client, how to map the client's region to the Riot Web API routing the existing pipeline needs, how to model the "active player" without breaking the single-account assumption, how the login event reloads the renderer, and what happens to the deprecated static config.

---

## 1. How to read the logged-in player from the League client

**Decision**: Talk to the **LCU (League Client Update) REST API** over loopback, authenticated by the **lockfile**. Resolve identity from `GET /lol-summoner/v1/current-summoner`.

- The running client writes a **lockfile** at `%LOCALAPPDATA%`-adjacent install path (`<LeagueInstall>/lockfile`), containing `name:pid:port:password:protocol` (colon-separated). The adapter reads it, parses it (pure `domain/identity/lockfile.ts`), and builds a base URL `https://127.0.0.1:<port>` with HTTP Basic auth `riot:<password>`.
- The client uses a **self-signed certificate**; the loopback HTTPS helper (`lcuHttp.ts`) must accept it. This allowance is scoped to `127.0.0.1` only (never a general TLS bypass).
- `GET /lol-summoner/v1/current-summoner` returns the logged-in summoner: `puuid`, `gameName`, `tagLine`, `displayName`, `summonerId`, `accountId`. **`puuid` is the join key** to everything Corky already stores.
- If the client is running but **logged out** (login screen), `current-summoner` returns a not-ready/empty result (e.g. 404 or an object with an empty `puuid`). The adapter maps that to a `loggedOut` connection state — never an identity.

**Rationale**: This is the documented, key-less local API the technical brief already commits to ("LCU … auth via local lockfile … Basic auth, self-signed cert"). `puuid` lines up with `account.puuid`, `matches.puuid`, `summoner_profile.puuid`, so no data reshaping is needed. It reveals only the player's own identity — Principle I compliant.

**Alternatives considered**:
- *Riot Client `LeagueClientLockfile` / RSO process inspection* — more brittle, undocumented, no identity advantage.
- *Keep asking the user to type a Riot ID* — exactly the manual-config pain this feature removes.
- *Live Client Data API (`:2999`)* — only exists **in-game**, not in the lobby/login state we must detect; reserved for a future feature.

---

## 2. Detecting login / logout / start / stop transitions

**Decision**: **Lockfile presence watch + light identity poll** for the MVP, behind a `subscribe(onChange)` method on the gateway. Design the port so a **WebSocket** upgrade is a drop-in later.

- **Client start/stop** = lockfile appears/disappears (watch the file; also re-check on a short interval as a cheap fallback for missed FS events).
- **Login/logout** = `current-summoner` transitions between a real `puuid` and not-ready. Poll every few seconds while the lockfile exists.
- The gateway debounces transient flaps and only emits a change when the *stable* state differs (addresses the "rapid login/logout flapping" edge case).
- A **WebSocket** (`wss://127.0.0.1:<port>`, subscribe `OnJsonApiEvent_lol-summoner_v1_current-summoner` and the lifecycle events) is the richer, lower-latency path. It is **out of scope for the MVP** but the `subscribe` contract is event-shaped so swapping poll→WS changes only the adapter.

**Rationale**: Polling every ~3–5 s comfortably meets SC-002 (≤30 s) with trivial code and no extra dependency, and is robust to the WS quirks of a starting/closing client. The event-shaped port keeps the upgrade cheap. Bounded, predictable, no busy loop.

**Alternatives considered**:
- *WebSocket-only now* — adds connection-lifecycle complexity (reconnect on client restart, subscription replay) for latency the product doesn't need yet.
- *Fixed long interval only* — simplest, but slow to notice a client that just closed; the lockfile watch makes start/stop near-instant for free.

---

## 3. Mapping the client region to Riot Web API routing

**Decision**: Derive **platform** (e.g. `euw1`) and **regional route** (e.g. `europe`) from the client via `GET /riotclient/region-locale` (returns `{ region: "EUW", locale, … }`), through a **pure mapping table** in `domain/identity/region.ts`.

- The existing pipeline needs **platform routes** (`euw1`) for `summoner-v4`/`league-v4` and **regional routes** (`europe`) for `account-v1`/`match-v5` (Constitution: mixing them 404s). The LCU `region` string (`EUW`, `NA`, `KR`, …) maps deterministically to both.
- The map covers the live shards (EUW→euw1/europe, EUNE→eun1/europe, NA→na1/americas, KR→kr/asia, etc.). An **unknown region returns `null`**, and `IdentityService` then falls back to the player's previously stored platform/region, or (dev) the env seed — never guesses.

**Rationale**: Region/platform must come from the client (FR-006) so a player on any shard works without editing config. A pure table is trivially table-tested (`region.test.ts`) and keeps the routing rule in one auditable place.

**Alternatives considered**:
- *Parse platform out of a match id / summoner payload* — incomplete and indirect.
- *Keep `PLATFORM`/`REGION` env vars authoritative* — defeats the feature; retained only as a dev seed (see §6).

---

## 4. Modelling the "active player" without breaking single-account code

**Decision**: Add a **single-row `active_player` pointer** (the active `puuid`) and resolve `getCurrentAccount()` through it; keep all `puuid`-partitioned tables as-is.

- Everything that matters is **already keyed by `puuid`** (`matches`, `summoner_profile`, `lp_snapshots`, reports, tasks). The *only* single-account assumption is `getCurrentAccount(): SELECT * FROM account LIMIT 1`.
- New `MatchRepository` methods `setActivePlayer(puuid)` / `getActivePlayer()`. `getCurrentAccount()` becomes: active pointer → `getAccount(puuid)`; if no pointer (legacy DB), fall back to `LIMIT 1`.
- `IdentityService.activate(identity)` = `upsertAccount(identity.toAccount())` + `setActivePlayer(puuid)`. Switching accounts just moves the pointer; **the previous player's rows are untouched** (FR-007, SC-004 — zero bleed-through, because every read is `WHERE puuid = active`).

**Rationale**: Lowest-ripple path from "one player" to "active of many": the ~12 use cases reading `getCurrentAccount()` are unchanged, data is already partitioned, and the switch is a pointer move. Matches the spec's "partitioned per account, no switcher UI" assumption.

**Alternatives considered**:
- *Thread an explicit `Account` through every use case* — large, risky refactor; no behavioural benefit.
- *`is_active` column on `account`* — workable, but a dedicated pointer row is clearer and avoids multi-row "which is active" ambiguity.
- *Wipe-on-switch (single slot)* — rejected: loses offline access to a prior player and contradicts offline-first.

---

## 5. Reloading the renderer when identity changes

**Decision**: On `ActivePlayerChanged`, push an **`identity:changed`** IPC event to the renderer; `useAppData` re-runs its bootstrap (re-fetch profile/matches/LP, reset transient screen state).

- `IdentityService` emits `ActivePlayerChanged` on the existing in-process event bus (`domain/events.ts`). A thin `adapters/driving/LcuEventListener.ts` forwards it to the focused `BrowserWindow` via `webContents.send('identity:changed', status)`.
- Preload exposes `onIdentityChanged(cb)` (`ipcRenderer.on`). The renderer treats it like the existing sync refresh: re-pull the three overview reads and re-render. No full window reload needed — React state refresh is enough and smoother.
- The same push carries the new `ClientStatus`, so the status chip and onboarding panel update in lockstep.

**Rationale**: Reuses the established refresh path in `useAppData` (already re-fetches on sync), so "reload the entire application for that player" is a state refresh, not a process restart. Keeps the renderer outside the hexagon (Principle IV).

**Alternatives considered**:
- *`win.reload()`* — heavier, flashes the UI, drops in-flight screen state for no gain.
- *Renderer polls a status query* — wasteful; a push is immediate and event-true.

---

## 6. Fate of the static `RIOT_ID` / `PLATFORM` / `REGION` config

**Decision**: Make them **optional dev seeds**, not required. `config.ts` stops throwing when `RIOT_ID` is absent. Live client detection always wins; the seed is used only when there is no client **and** no cached player (so a developer can still boot without a client).

- Today `config.ts` does `require('RIOT_ID')` and hard-fails if missing — incompatible with FR-005/FR-011. The fields become `process.env.RIOT_ID ?? undefined`, etc.
- `IdentityService` resolution order: **live client → last-known active player (DB) → dev seed (env, if present) → none (onboarding)**. The seed sits *below* the cache so it never overrides a real detected/known player.

**Rationale**: Honours "no manual configuration required" while keeping a friction-free dev/test boot path. The seed is a convenience, not the product behaviour.

**Alternatives considered**:
- *Delete the env vars entirely* — would force every dev run to have a live client; the seed is a cheap escape hatch kept strictly subordinate to detection.

---

## 7. Testing strategy given an un-mockable external client

**Decision**: All automated coverage runs **behind a fake `LeagueClientGateway`**; the real LCU adapter is verified **manually** (quickstart). Pure helpers are table-tested.

- Pure & fully tested: `lockfile.ts` (parse), `region.ts` (mapping + unknown), `resolution.ts` (live/cache/none, switch vs keep-on-logout), and `IdentityService` (fake gateway + fake repos: activation upserts + moves pointer, emits once, offline fallback, degrade-on-unreadable).
- Not unit-tested: `LcuLeagueClientGateway` HTTP/WS/lockfile-FS — external, stateful, no network in CI (Principle V). The spec's US1 Independent Test already calls for a controlled/mocked client; the fake gateway is that control.

**Rationale**: Keeps the testable heart pure and fixture-free of network, consistent with the carried `better-sqlite3`-ABI caveat where the thin adapter is the untested edge.

---

## Open items intentionally deferred (not blocking)

- **WebSocket live events** (lower-latency than polling) — port is event-shaped; adapter upgrade only.
- **Champ-select / rune-import / in-game** — future features that *consume* this `LeagueClientGateway`; explicitly out of scope (spec "Out of Scope").
- **Multi-account switcher UI** — out of scope; data is partitioned and the pointer makes a future switcher cheap.
