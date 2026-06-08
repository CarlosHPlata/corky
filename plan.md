# Project Corky — Build Plan
 
Execution checklist for an agent (e.g. Claude Code). Work **top to bottom**, checking off items as you go. Read `REQUIREMENTS.md` (product/domain) and `TECHNICAL_BRIEF.md` (stack/architecture) first; this plan assumes both.
 
## Ground rules (apply to every task)
 
- [ ] `domain/` and `application/` layers MUST NOT import `electron` or any adapter SDK (Riot, LCU, Anthropic, SQLite). Keep them framework-free.
- [ ] IPC handlers are thin: validate input, call a command/query use case, return a DTO from `shared/`.
- [ ] Use cases are split into **commands** (mutate/act) and **queries** (read-only). One IPC channel per use case.
- [ ] Driven adapters implement ports defined in `application/ports/`. Wire them in the composition root (`infrastructure/`).
- [ ] Secrets (Riot key, Anthropic key) live only in the main process. Never pass them to preload/renderer.
- [ ] Store raw match + timeline JSON; all extraction reads from the local DB, never re-fetches.
- [ ] Every domain/application unit gets a Vitest test using stored-match fixtures. No live API calls in tests.
- [ ] Riot routing: regional (`europe`) for account/match; platform (`euw1`) for summoner/league.
---
 
## M0 — Scaffold & match sync
 
- [ ] Scaffold: `npm create @quick-start/electron@latest` → React + TS template. App launches and renders a blank React window.
- [ ] Configure electron-vite to externalise `better-sqlite3` (do not bundle); verify it loads in the packaged main process.
- [ ] Create the folder structure from `TECHNICAL_BRIEF.md` (`domain/`, `application/{commands,queries,ports,events}`, `adapters/{driving,driven}`, `infrastructure/`, `preload/`, `renderer/`, `shared/`).
- [ ] Add config loader (`infrastructure/config.ts`) reading `RIOT_API_KEY`, `ANTHROPIC_API_KEY`, `RIOT_ID` (gameName#tagLine), `PLATFORM`/`REGION` from `.env`. Provide `.env.example`.
- [ ] Define `shared/types.ts` DTOs: `Account`, `MatchSummary`, `MatchDetail`, `Timeline`.
- [ ] Define ports in `application/ports/`: `MatchDataSource`, `MatchRepository`.
- [ ] Implement `adapters/driven/sqlite/` repository with this schema (run as migration on startup):
  ```sql
  CREATE TABLE IF NOT EXISTS account   (puuid TEXT PRIMARY KEY, game_name TEXT, tag_line TEXT, platform TEXT, region TEXT);
  CREATE TABLE IF NOT EXISTS matches   (match_id TEXT PRIMARY KEY, puuid TEXT, queue INT, champion TEXT,
                                        win INT, game_creation INT, game_duration INT, raw_json TEXT);
  CREATE TABLE IF NOT EXISTS timelines (match_id TEXT PRIMARY KEY, raw_json TEXT);
  CREATE TABLE IF NOT EXISTS features      (match_id TEXT PRIMARY KEY, json TEXT);
  CREATE TABLE IF NOT EXISTS coach_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT,
                                            created_at INT, model TEXT, content TEXT);
  ```
- [ ] Implement `adapters/driven/riot/` client over native `fetch`, behind a token-bucket rate limiter (~20 req/s, 100/2min). Methods: resolve PUUID (`account-v1`), list match IDs (`match-v5`), fetch match detail + `/timeline`.
- [ ] Implement command `SyncRecentMatches(count)`: resolve account once → list IDs → for each unseen ID, fetch + persist raw JSON. Idempotent (skip stored IDs).
- [ ] Implement query `GetMatchList()`: return stored `MatchSummary[]`.
- [ ] Wire two IPC channels (`matches:sync`, `matches:list`) through preload `contextBridge`.
- [ ] Renderer: one screen with a "Sync last 20" button calling `window.api.syncMatches(20)`, then rendering `getMatchList()`.
- [ ] **Acceptance:** `npm run dev` → click sync → matches appear → re-running does not re-fetch. Riot key never reaches the renderer.
---
 
## M1 — Feature extraction engine (TDD)
 
- [ ] Save 5–10 real matches (detail + timeline) as JSON fixtures under `test/fixtures/`.
- [ ] Define `domain/` feature model: `MatchFeatures` (per-game) — gold/XP diff series, CS-vs-benchmark, per-death context, objective participation, vision footprint, lead-conversion flag.
- [ ] Implement pure extraction functions (no I/O) in `domain/`:
  - [ ] Gold/XP differential curves vs lane opponent and vs team, per frame.
  - [ ] CS/min at 10/15/20 min vs a role benchmark constant.
  - [ ] Per-death classifier from `CHAMPION_KILL` events: position, gold state at frame, ally/enemy positions → label `caught_out` | `overextended` | `fair_fight` | `outnumbered`.
  - [ ] Objective participation: presence near `ELITE_MONSTER_KILL` / `BUILDING_KILL` events.
  - [ ] Vision footprint from `WARD_PLACED` / `WARD_KILL`.
  - [ ] Lead-conversion flag: team gold diff > 0 at 20 min AND game lost.
- [ ] Vitest table tests for each function against fixtures.
- [ ] Implement command `ExtractFeatures(matchId)`: load timeline from repo → run extraction → persist to `features`.
- [ ] **Acceptance:** features computed for all fixtures; numbers sanity-check against op.gg for the same games.
---
 
## M2 — Post-game coaching report
 
- [ ] Define port `CoachingModel` in `application/ports/` and `ReportRepository`.
- [ ] Implement `adapters/driven/anthropic/` implementing `CoachingModel`.
- [ ] Build a deterministic prompt builder in `application/` that takes `MatchFeatures` (computed, not raw JSON) + key event sequences and produces the model input. Unit-test the prompt-building (input contract), not the generation.
- [ ] Implement command `AnalyzeMatch(matchId)`: ensure features exist → build prompt → call `CoachingModel` → persist to `coach_reports`. Report must prioritise the 1–2 highest-impact decisions, not dump stats.
- [ ] Implement query `GetCoachReport(matchId)`.
- [ ] IPC + renderer: match list → select a match → trigger analysis → render the report.
- [ ] **Acceptance:** for a stored game, the report names *why* it was won/lost and the key turning point, in plain language matching `REQUIREMENTS.md` user stories.
---
 
## M3 — Cross-game trends
 
- [ ] Define trend read model (materialised from `features` across N games).
- [ ] Implement command `RefreshTrends()` and query `GetTrends()`: recurring patterns (e.g. "even at 10 but behind by 15 in X% of recent games", "lead-conversion failures").
- [ ] Feed trends to `CoachingModel` for a longitudinal coaching summary.
- [ ] Renderer: a trends view.
- [ ] **Acceptance:** Corky surfaces a pattern across games, not just single-game tips.
---
 
## M4 — Champion-select assistant (live, via LCU)
 
- [ ] Define ports `ChampSelectGateway`, `RunesGateway`.
- [ ] Implement `adapters/driven/lcu/`: read `lockfile` (port + password), Basic auth, accept self-signed cert. REST + WS.
- [ ] Implement driving adapter `LcuEventListener`: subscribe to champ-select session; emit `ChampSelectEntered` / updates on the in-process event bus.
- [ ] Implement command `SuggestForChampSelect(session)`: read picks/bans/assigned role → build prompt (matchup, threats, win condition, build/rune direction) → call `CoachingModel`.
- [ ] IPC push channel: stream champ-select state + suggestions to the renderer via `webContents.send`.
- [ ] (Optional) `ImportRunes` command writing to `lol-perks`.
- [ ] **Acceptance:** entering champ select live triggers relevant, game-specific advice in the UI.
---
 
## M5 — Desktop polish & packaging
 
- [ ] Move secrets from `.env` to Electron `safeStorage`.
- [ ] App settings screen (Riot ID, keys, region).
- [ ] Build a Windows installer artifact.
- [ ] Basic error/empty/loading states across screens.
- [ ] **Acceptance:** installable Windows app that runs the full MVP (Flow A + Flow B) standalone.
---
 
## Later (out of MVP — do not start without explicit go-ahead)
 
- [ ] In-game companion via Live Client Data API (own-state only; death-screen nudges; strictly no information advantage, no commands).
- [ ] Decide overlay tech (Overwolf vs custom transparent always-on-top) when starting the in-game phase.
- [ ] `.rofl` replay parsing for frame-level micro analysis.
