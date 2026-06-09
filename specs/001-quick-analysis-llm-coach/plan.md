# Implementation Plan: Quick Analysis — LLM Session Coach

**Branch**: `001-quick-analysis-llm-coach` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-quick-analysis-llm-coach/spec.md`

## Summary

Wire the Home screen's "Quick analysis" card to Corky's first real LLM session-coach. On demand, the app computes a set of cross-game **session signals** (deaths/game in wins vs losses, CS/min gap vs a rank/champion/patch benchmark, a lead-conversion proxy, champion-pool shape, LP trajectory choppiness) from the player's already-local match summaries, profile, and LP history, then hands those *pre-computed facts* plus a resolved benchmark to a coaching model that prioritizes, diagnoses, and writes 2–3 blunt, actionable insights. Benchmarks come from the OP.GG open MCP service as a best-effort, per-patch-cached reference layer, with a built-in general-benchmark fallback so the feature never fails when OP.GG is down. The model never fetches data and never invents figures; computed signals are the single source of truth (Constitution II). The result is session-cached in the renderer, not persisted.

**Technical approach**: a new framework-free `computeSessionFeatures` in `domain/`, a new `SessionCoachingModel` port + `BenchmarkDataSource` port in `application/ports/`, a read-only `GetSessionAnalysis` query orchestrating them, an `analysis:session` IPC channel, and a renderer refactor of the `QuickAnalysis` component built against a stub first (Constitution VIII).

## Technical Context

**Language/Version**: TypeScript 5.8, Node ≥22 (Electron 35 main process), React 18 (renderer)
**Primary Dependencies**: `@anthropic-ai/sdk` ^0.38 (existing), `@modelcontextprotocol/sdk` (NEW — client for OP.GG remote MCP over streamable HTTP), `better-sqlite3` (existing, unaffected)
**Storage**: SQLite (existing) for the player's own data; **no new persisted tables** for this feature — session analysis is ephemeral (FR-021); benchmark cache is in-memory per patch in the adapter
**Testing**: Vitest with stored fixtures; pure compute functions table-tested; adapters tested against saved response fixtures (no live network — Constitution V)
**Target Platform**: Windows desktop (Electron), renderer is a local React SPA
**Project Type**: Electron desktop app, hexagonal architecture in main process; React renderer outside the hexagon
**Performance Goals**: completed analysis within ~10s of the click (SC-001); the OP.GG fetch is off this path (prefetched/cached on sync — FR-013)
**Constraints**: secrets stay in main (Constitution VI); domain/application import no SDK (Constitution IV); frontend built against stub before wiring (Constitution VIII); analysis must degrade gracefully when OP.GG and/or network is unavailable (FR-011, FR-017)
**Scale/Scope**: single user; ~20 recent matches per analysis; 2–3 insights per run; one new IPC channel; ~2 new ports, 2 new adapters, 1 query, 1 domain module, 1 renderer hook + component refactor

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Principle IV — Hexagonal Architecture**: `computeSessionFeatures` lives in `domain/` (pure, no imports); `SessionCoachingModel` and `BenchmarkDataSource` are ports in `application/ports/`; OP.GG and Anthropic SDK usage is confined to `adapters/driven/`; `GetSessionAnalysis` is a use case wired in the composition root. No SDK import crosses into domain/application.
- [x] **Principle VI — Secrets in Main Process**: the Anthropic key stays in main (reused from `config`); OP.GG needs no key; the renderer receives only the `SessionAnalysis` DTO via IPC. No credential reaches preload/renderer.
- [x] **Principle VIII — Frontend First**: the `QuickAnalysis` UI is rebuilt against a stub in `src/renderer/src/stubs/quickAnalysis.ts` (shaped exactly to the new `SessionAnalysis` DTO) and reviewed before any IPC wiring; the wiring step swaps the stub import for `window.api.getSessionAnalysis()` with no layout change.
- [x] **Principle V — Test-First**: `computeSessionFeatures` and benchmark fallback resolution are pure and table-tested against fixtures; the OP.GG response mapper and the LLM-output parser are tested against saved JSON fixtures; no test touches the network.
- [x] **Principle VII — Offline-First**: the player's own data is read from the local DB via existing repositories (never re-fetched); benchmark is cached and falls back to a built-in general benchmark, so a degraded/offline benchmark never blocks analysis. (The LLM call itself requires network — inherent to the feature, like `AnalyzeMatch` — and fails gracefully per FR-017.)

**Result**: PASS. No violations; Complexity Tracking not required.

### Constitution-specific notes carried into design

- **Principle II (Evidence-Grounded)**: `SessionInsight.evidence` strings are drawn from the computed `SessionFeatures` (e.g. `avgKDA 3.1 · 38% WR`); the prompt forbids citing any number not provided. This mirrors the `evidenceRef`-into-`MatchFeatures` rule at session altitude.
- **Principle III (Personalised Over Generic)**: benchmark resolution follows the cohort fallback chain — champion+lane+patch → role/rank → **general benchmark constant** — and every cited benchmark is tagged with its basis (`SessionInsight.benchmarkBasis`), honouring the ≥3-sample provisional rule via `confidence`.

## Project Structure

### Documentation (this feature)

```text
specs/001-quick-analysis-llm-coach/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── ipc-session-analysis.md
│   ├── session-coaching-model.port.md
│   ├── benchmark-data-source.port.md
│   └── llm-output.schema.json
└── checklists/
    └── requirements.md  # From /speckit-specify
```

### Source Code (repository root)

```text
src/
  main/
    domain/
      sessionFeatures.ts            # NEW — computeSessionFeatures() + types (pure, no I/O)
      benchmark.ts                  # NEW — BenchmarkReference type + GENERAL_BENCHMARKS table + resolveBenchmark()
    application/
      ports/
        SessionCoachingModel.ts     # NEW — analyzeSession(features): Promise<SessionAnalysisOutput>
        BenchmarkDataSource.ts      # NEW — getChampionBenchmark(champion, role, rank): Promise<...|null>
      queries/
        GetSessionAnalysis.ts       # NEW — orchestrates repos + benchmark + coaching model
    adapters/
      driven/
        anthropic/
          AnthropicSessionCoachingModel.ts   # NEW — session prompt + structured parse
          sessionPrompt.ts                   # NEW — system + data serialization + output contract
        opgg/                                # REUSABLE OP.GG integration (intended for reuse beyond this feature)
          OpggMcpClient.ts                   # NEW — typed, cached client over the OP.GG MCP tools (transport + timeouts + per-patch cache)
          opggTypes.ts                       # NEW — typed models for OP.GG responses (lane meta, champion analysis, ...)
          OpggBenchmarkDataSource.ts         # NEW — implements BenchmarkDataSource by delegating to OpggMcpClient (this feature's slice)
    adapters/driving/
      IpcController.ts              # EDIT — register 'analysis:session'
    infrastructure/
      container.ts                 # EDIT — wire benchmark source, session model, query
  preload/
    index.ts                       # EDIT — expose getSessionAnalysis
  shared/
    types.ts                       # EDIT — SessionInsight, SessionAnalysis, IpcApi addition
  renderer/src/
    stubs/
      quickAnalysis.ts             # NEW — stub SessionAnalysis (Constitution VIII)
    data/
      useQuickAnalysis.ts          # NEW — hook: state machine + session cache
    screens/
      Home.tsx                     # EDIT — QuickAnalysis renders real DTO + states

test/
  unit/
    sessionFeatures.test.ts        # NEW — table tests for compute
    benchmark.test.ts              # NEW — fallback resolution
    sessionPrompt.test.ts          # NEW — prompt includes facts / no invented numbers contract
    OpggBenchmarkDataSource.test.ts# NEW — maps saved OP.GG fixture; fallback on error
  fixtures/
    opgg-lane-meta.sample.json     # NEW — saved OP.GG response for tests
```

**Structure Decision**: Follows the fixed hexagonal layout from `technical_brief.md`. New domain logic is pure; external SDKs (Anthropic, MCP) are isolated in `adapters/driven/{anthropic,opgg}`; the single new use case is a read-only query wired in `infrastructure/container.ts`; the renderer change is frontend-first against a stub.

**OP.GG layering for reuse (deliberate)**: the OP.GG integration is built in two tiers so it can serve future features (Home-page meta stats, other analyses) without rework:
- **Tier 1 — reusable client** `OpggMcpClient` owns the MCP transport, typed response models (`opggTypes.ts`), per-patch caching, and timeouts. It exposes the OP.GG tool surface generically (lane meta, champion analysis, leaderboards, …), not a single feature's question. It is the one place that knows about MCP/OP.GG.
- **Tier 2 — per-feature ports** live in `application/ports/` (here, `BenchmarkDataSource`). Each is a *narrow* interface answering one feature's need; its adapter delegates to the shared `OpggMcpClient`. This preserves interface segregation (the hexagon never depends on a fat "all of OP.GG" port) while the integration code is written once.

A future feature reuses Tier 1 directly and adds its own small Tier-2 port — no change to this feature's `BenchmarkDataSource`.

## Complexity Tracking

> No constitution violations — table intentionally empty.
