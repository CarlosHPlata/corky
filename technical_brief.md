# Project Corky — Technical Brief
 
One-page technical reference. Product/domain scope lives in `REQUIREMENTS.md`; execution steps live in `PLAN.md`.
 
## Stack
 
- **Runtime/shell:** Electron (Windows-only target — League + Vanguard require Windows).
- **Language:** TypeScript end-to-end (main, preload, renderer, shared).
- **UI:** React (renderer process only).
- **Scaffolding/build:** electron-vite (Vite HMR, separate main/preload/renderer TS builds).
- **Persistence:** SQLite via `better-sqlite3` (synchronous, in main process; native module — must be externalised in electron-vite and rebuilt against Electron's ABI).
- **HTTP:** native `fetch` (built into Electron's Node). Rate limiting via a token bucket / `bottleneck` in front of the Riot client.
- **LLM:** `@anthropic-ai/sdk`.
- **Tests:** Vitest. Domain/application layers are framework-free and tested with stored-match fixtures.
## Architecture
 
**Hexagonal (ports & adapters), contained entirely in the Electron main process.** The renderer (React) sits **outside the hexagon** as a client of the IPC driving port — it holds no domain logic.
 
**Application layer = lightweight CQRS:** use cases split into **commands** (`SyncRecentMatches`, `AnalyzeMatch`, `EvaluateFocusTasks`, `RefreshTrends`, `SuggestForChampSelect`, `ImportRunes`) and **queries** (`GetMatchList`, `GetCoachReport`, `GetTrends`, `GetChampSelectState`, `ResolveComparisonCohort`). Each maps onto an IPC channel. **No separate read/write stores, no event sourcing, no command-bus framework** — single-user local app, so that machinery is pure overhead. Derived tables (`features`, `coach_reports`, `focus_tasks`, `task_evaluations`, trend aggregates) are **materialised read models** built from the raw write store.
 
**Events:** an in-process typed `EventEmitter` carries domain events from the live-feed driving adapters (`ChampSelectEntered`, `GameStarted`, `GameEnded`) to handlers that orchestrate pipelines (e.g. `GameEnded` → `SyncRecentMatches` → extraction → `AnalyzeMatch`). This is the genuinely event-driven part — distinct from CQRS, and not event sourcing.
 
**Ports & adapters:**
- *Driven (secondary):* `MatchDataSource`→RiotApi, `MatchRepository`/`ReportRepository`→SQLite, `CoachingModel`→Anthropic, `ChampSelectGateway`/`RunesGateway`→LCU, `LiveGameFeed`→LiveClientData (later).
- *Driving (primary):* `IpcController` (renderer-facing), `LcuEventListener` + `LiveGamePoller` (event-driven).
**Folder structure:**
```
src/
  main/
    domain/          # entities, value objects, domain events — zero deps, never imports electron
    application/
      commands/      # command use cases
      queries/       # query use cases
      ports/         # interfaces implemented by driven adapters
      events/        # domain event types + bus
    adapters/
      driving/       # ipc-controller, lcu-listener, live-poller
      driven/        # riot/, lcu/, anthropic/, sqlite/
    infrastructure/  # electron wiring, composition root (DI), config/secrets
    index.ts         # app lifecycle, BrowserWindow
  preload/index.ts   # contextBridge: expose typed fns only (never keys)
  renderer/          # React UI (outside the hexagon)
  shared/types.ts    # DTOs shared main<->renderer
```
**Hard rule:** `domain/` and `application/` must never import `electron` or any adapter SDK. IPC handlers are thin and delegate into use cases.
 
## Domain contracts (MVP)
 
These shape the post-game pipeline (see `REQUIREMENTS.md` → "the post-game report") and are implementation requirements, not UI niceties.
 
**Coaching output is structured and evidence-referenced.** `CoachingModel` returns a typed report, not free prose. Each claim carries an `evidenceRef` keyed into the computed features (e.g. `goldDiff@14:20`, `death#3`, `objective:baron@24:40`), so the renderer highlights the exact chart point or map marker the AI is pointing at. Computed `MatchFeatures` are the single source of truth for all numbers; the model annotates them and never invents figures.
 
**Focus tasks are measurable objects, auto-evaluated next game.** Each task is `{ id, description, metric, comparator, target, scope }`: `metric` is a key the extraction engine can compute (`cs_at_10`, `solo_river_deaths`, `objectives_present_first_two_drakes`…), `comparator`/`target` make it checkable (`>= 70`, `== 0`), and `scope` records applicability (`champion` / `role` / `universal`). Pipeline: `AnalyzeMatch` generates and persists tasks for the game; on the next analysed game, `EvaluateFocusTasks` recomputes each prior task's metric, compares to target, and marks `improved | held | regressed | not_applicable` (the last when `scope` doesn't match the new game's champ/role), feeding the result into the next report's "Since last game" section. New tables: `focus_tasks` (per source match) and `task_evaluations` (per evaluating match). `GenerateFocusTasks` is folded into `AnalyzeMatch`, not a separate command.
 
**Comparison cohorts resolve by fallback.** `ResolveComparisonCohort` selects a baseline in priority order — exact matchup (your champ vs lane opponent) → same champion (any opponent) → same role → general benchmark constant — preferring the player's **winning** games within the chosen cohort, requiring a minimum sample (≥3) before using a personal cohort, and falling back to the benchmark on cold start. Every comparison surfaced to the UI is **tagged with the cohort actually used**, so the report states its own basis honestly.
 
## Integrations & data sources
 
- **Riot Web API** (key required, main-process only): `account-v1` (PUUID from Riot ID), `match-v5` (match + `/timeline`), `summoner-v4`/`league-v4` (rank). Routing split: **regional** routes (`europe`) for account/match, **platform** routes (`euw1`) for summoner/league.
- **LCU (League Client API)** — no key; auth via local `lockfile` (port + password, Basic auth, self-signed cert). Champ select via `lol-champ-select/v1/session` (REST + WS); rune import via `lol-perks`.
- **Data Dragon** — versioned static data + assets, cached locally per patch.
- **OP.GG open MCP** (`https://mcp-api.op.gg/mcp`, streamable HTTP, no key) — public champion/lane **meta** statistics used only as the benchmark/reference layer behind personal coaching (never as a meta/tier-list product). Wrapped by a single reusable `OpggMcpClient` (Tier 1: transport, cache, timeout, typed mapping) that per-feature ports delegate to — inject the shared instance for future features. Best-effort & undocumented: bounded by a ~3s timeout, cached, and degrades to a built-in general benchmark on any failure. Meta tools only — no player-account lookups (the player's own facts come from Riot). The SDK is ESM-only, so it is excluded from electron-vite's `externalizeDepsPlugin` to be bundled into the main process.
- *Later:* Live Client Data API (`https://127.0.0.1:2999`) for in-game own-state; local `.rofl` replays for micro.
## Constraints & compliance (these gate implementation)
 
- **Windows-only**; the overlay/in-game work (post-MVP) is the only part that needs the running game.
- **Secrets live only in the main process.** Renderer never sees the Riot or Anthropic key. Preload exposes operations, not credentials. Dev: `.env`; production: Electron `safeStorage`.
- **Personal Riot key expires every 24h** and is rate-limited (~20 req/s, 100/2min) — handle refresh/limits; consider a production key later.
- **Store raw match/timeline JSON locally; extract offline.** Fetch once, never re-hit the API for the same match. Stored matches double as test fixtures.
- **Adapters may only surface player-visible information.** No enemy cooldowns, no hidden/predicted timers, no information advantage. Global objective timers (Dragon/Baron/Herald/Elder) are permitted because the game shows them to everyone; jungle-camp timers are avoided. Outputs are coaching, never automated commands.
## MVP technical goal
 
Two flows, no overlay: **post-game analysis** (Riot API + offline feature extraction + LLM over computed features) and **champion-select assistant** (LCU live read + LLM). Build the post-game pipeline first — it needs no running client and is fully testable from stored fixtures.
