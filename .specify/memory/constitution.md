<!--
SYNC IMPACT REPORT
==================
Version change: (blank template) → 1.0.0
All sections: initial population from requirements.md, technical_brief.md, plan.md

Modified principles: N/A (first population)
Added sections:
  - Core Principles (7 principles derived from requirements.md guiding principles)
  - Compliance & Data Constraints
  - Development Workflow
Removed sections: N/A

Templates checked:
  - .specify/templates/plan-template.md  ✅ Constitution Check gate aligns with Principle IV (hexagonal)
  - .specify/templates/spec-template.md  ✅ No conflicting references; scope/requirements align
  - .specify/templates/tasks-template.md ✅ Test discipline aligns with Principle V (test-first)

Deferred TODOs: none
-->

# Corky Constitution

## Core Principles

### I. Player-First Coaching

Every feature MUST serve the goal of making the player a better decision-maker — not to automate decisions, reveal hidden information, or provide an information advantage over opponents.

- Features that require reading game memory, injecting code, or touching game files are FORBIDDEN.
- Corky MUST only surface information the player can already see in the game client or post-game screen.
- Global objective timers (Dragon/Baron/Herald/Elder) are permitted; jungle-camp respawn timers are not.
- Outputs are coaching explanations, never automated commands or real-time instructions.

### II. Evidence-Grounded Coaching

Every coaching claim the AI produces MUST be anchored to computed evidence the player can see.

- `CoachingModel` MUST return a typed, structured report — not free prose. Each claim MUST carry an `evidenceRef`
  keyed into the computed `MatchFeatures` (e.g., `goldDiff@14:20`, `death#3`, `objective:baron@24:40`).
- Computed `MatchFeatures` are the single source of truth for all numbers. The model annotates them; it MUST NOT
  invent or assert figures not present in the feature set.
- Reports lead with a verdict and a small number of focus tasks. Detail is available for drill-down; it MUST NOT
  be the default greeting.

### III. Personalised Over Generic

Analysis MUST compare the player's performance against their own history wherever data is sufficient.

- `ResolveComparisonCohort` MUST follow the fallback chain: exact matchup → same champion → same role →
  general benchmark constant, preferring the player's **winning** games within the chosen cohort.
- A personal cohort requires a minimum of **3 samples** before it is used; the benchmark is the fallback on cold
  start.
- Every comparison surfaced to the UI MUST be tagged with the cohort actually used so the report states its own
  basis honestly (e.g., "compared to your 5 Ahri wins" vs. "compared to role benchmark").

### IV. Hexagonal Architecture (NON-NEGOTIABLE)

`domain/` and `application/` layers MUST NOT import `electron`, `better-sqlite3`, the Riot SDK, the LCU client,
or the `@anthropic-ai/sdk`. They are framework-free.

- IPC handlers MUST be thin: validate input → call a command/query use case → return a DTO from `shared/`.
- Use cases are split into **commands** (mutate/act) and **queries** (read-only). One IPC channel per use case.
- Driven adapters MUST implement ports defined in `application/ports/`. All wiring happens in the composition
  root (`infrastructure/`).
- The renderer (React) sits outside the hexagon as a client of the IPC driving port; it MUST hold no domain
  logic.

### V. Test-First with Fixtures

Every `domain/` and `application/` unit MUST have a Vitest test backed by stored match fixtures.

- No live API calls in tests. Real match/timeline JSON saved under `test/fixtures/` doubles as the test dataset.
- Feature extraction functions are pure (no I/O) and MUST be table-tested against fixtures.
- Acceptance criteria for each milestone require that numbers sanity-check against an external reference (e.g.,
  op.gg) for the same stored games.

### VI. Secrets Stay in the Main Process

The Riot API key and Anthropic API key MUST remain in the main process at all times.

- The preload layer exposes typed operations via `contextBridge`, never raw keys or credentials.
- In development: keys are loaded from `.env`. In production: keys MUST be stored and retrieved via Electron
  `safeStorage`.
- A Riot personal development key expires every 24 h; the application MUST handle key expiry gracefully and
  prompt the user to refresh, not crash silently.

### VII. Offline-First Data

Raw match JSON and timeline JSON MUST be stored locally on the first successful fetch and MUST NOT be
re-fetched for the same `match_id`.

- `SyncRecentMatches` is idempotent: it skips any `match_id` already present in the local DB.
- All feature extraction reads from the local DB, never from the Riot API directly.
- This ensures analysis works offline, protects against rate-limit exhaustion, and keeps stored matches as
  stable test fixtures.

## Compliance & Data Constraints

These constraints gate implementation. A feature that violates them MUST NOT be shipped, even as a
post-MVP item.

- **Windows-only target**: Electron is configured for Windows. Vanguard/anti-cheat compliance requires the
  Windows build path; macOS/Linux builds are not supported in the MVP.
- **Riot API routing**: Regional routes (`europe`) for `account-v1` and `match-v5`; platform routes (`euw1`)
  for `summoner-v4` and `league-v4`. Mixing them causes 404s.
- **Rate limiting**: The Riot API client MUST enforce a token-bucket rate limiter (~20 req/s, 100/2 min).
  Exceeding limits risks key revocation.
- **Player-visible information only**: No enemy cooldowns, no hidden predictive timers, no information the
  player cannot already see. Objective timers shown in-game are permitted; computed predictions from partial data
  are not.
- **Focus tasks are measurable objects**: Each task is `{ id, description, metric, comparator, target, scope }`.
  `metric` must be a key the extraction engine can compute. Tasks without a computable metric MUST NOT be
  generated.

## Development Workflow

These rules apply to every task in the build plan.

- **Folder structure is fixed**: Follow `src/main/{domain,application,adapters,infrastructure}`, `src/preload`,
  `src/renderer`, `src/shared` as defined in `technical_brief.md`. New files go in the correct layer; no
  shortcuts.
- **Milestone acceptance gates**: Each milestone (M0–M5) has explicit acceptance criteria in `plan.md`. A
  milestone is DONE only when its acceptance criterion passes — not when implementation is committed.
- **No live API calls in CI/tests**: Use stored fixtures. Any test touching the network is a test bug.
- **External `better-sqlite3`**: Must be externalised in electron-vite config and rebuilt against Electron's
  ABI. Do not bundle it.
- **Constitution Check in every plan**: The `plan-template.md` Constitution Check gate MUST reference these
  principles. A feature plan that does not pass the hexagonal constraint (Principle IV) and the secrets
  constraint (Principle VI) MUST NOT proceed to implementation.

## Governance

- This constitution supersedes all other ad-hoc practices and verbal agreements for project Corky.
- Amendments require: (1) a documented rationale, (2) a version increment following semantic versioning
  (MAJOR for principle removal/redefinition; MINOR for new principle or section; PATCH for clarifications),
  and (3) a propagation check across all `.specify/templates/` files.
- All feature plans and task lists MUST include a Constitution Check that verifies compliance with Principles
  IV, V, VI, and VII as minimum gates.
- Violations that are truly necessary MUST be documented in the plan's Complexity Tracking table with a
  rationale and the simpler alternative that was rejected.
- The runtime guidance file is `CLAUDE.md` (project root); agent-specific behaviour lives there and does not
  override this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-06-08 | **Last Amended**: 2026-06-08
