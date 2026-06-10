# Implementation Plan: Agentic Coach Chat

**Branch**: `005-agentic-coach-chat` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-agentic-coach-chat/spec.md`

## Summary

Evolve the spec-004 read-only post-game chat into an **agentic coach** that can *propose* state changes — standing-task updates and reflection create/update/delete — through a **bounded tool loop** (≤3 tool rounds per player message), rendered as **confirm-first proposal cards** inline in the transcript. Nothing persists from model output; an explicit Accept runs a validating command, Reject informs the coach. Two new first-class stores: **reflections** (many per match, 0..n evidence refs, player- or coach-authored) and **chat sessions** (many per match, independent transcripts, shared server-rebuilt context). Standing-task rows become touchable evidence (`task:<id>` refs). The finalize ceremony is replaced by a "Summarize into a reflection" shortcut that emits a standard reflection proposal; semantic-memory distillation moves to coach-reflection acceptance.

**Technical approach** — net-new logic concentrates in:

- A **`chatAgentic`** method on the existing `MatchCoachingModel` port: same briefing + history input as `chat()`, plus proposal-tool definitions; returns `{ reply, proposal? }`. The Anthropic adapter runs a capped tool-use loop (the existing forced-tool/`callTool` machinery, now with `tool_choice: auto` over propose-tools); every tool call is captured as a **draft proposal** and answered with a synthetic "shown to player for confirmation" result — the model never sees an executed side effect.
- Pure domain validation in **`domain/chat/proposal.ts`**: sanitise model proposals before they render (task invariants via existing `mergeStanding`/`enforceStandingSet` + metric registry; reflection refs validated against the anchor catalog + standing set), compute the **baseline signature** used for stale detection, and resolve acceptance deterministically.
- A **`ResolveProposal`** command — the only write path for model-initiated changes: re-validate against *current* state, apply atomically (tasks via ReportRepository, reflections via the new ReflectionRepository), mark the embedded proposal resolved in its session row exactly once, and (for accepted coach reflections) trigger best-effort memory distillation.
- New SQLite tables **`reflections`** and **`chat_sessions`** with **idempotent migration** from `chat_transcripts` (legacy transcript → first session, legacy reflection → first reflection, deterministic legacy ids).
- Renderer: sessions switcher + proposal cards in `CoachChat`, a Reflections section on the report, `Askable`-wrapped `FocusTask` rows — all built against **stubs first** (Constitution VIII), then wired 1:1 to new IPC channels.

## Technical Context

**Language/Version**: TypeScript 5.8, Node ≥22 (Electron 35 main), React 18 (renderer)
**Primary Dependencies**: existing only — `@anthropic-ai/sdk`, `better-sqlite3`, existing OP.GG MCP client. **No new dependencies.**
**Storage**: SQLite (existing DB). **Two new tables** (`reflections`, `chat_sessions`) + one idempotent data migration from `chat_transcripts` (kept in place, no longer written). `standing_focus_tasks`, `semantic_objects`, `match_analyses` unchanged.
**Models**: chat stays on the **light tier** (`claude-haiku-4-5`) including the proposal tool loop and the post-accept distillation call. No heavy-tier usage added.
**Testing**: Vitest, existing `test/unit` + `test/fixtures` layout. Pure `domain/chat/proposal.ts` and prompt validators table-tested; adapter tool-loop tested with a fake `CreateMessage` (canned tool-use sequences: 0 tools, 1 proposal, runaway >3 rounds, malformed payload). SQLite repo tests carry the known ABI caveat.
**Target Platform**: Windows desktop (Electron); renderer is a local React SPA.
**Project Type**: Electron desktop app, hexagonal main process; React renderer outside the hexagon.
**Performance Goals**: A no-proposal chat reply costs the same as today (discovery + one response call). A proposal adds at most 3 bounded tool rounds on the light tier. Accept/Reject is local-only (SQLite) except coach-reflection accept, which adds one async best-effort light call (distillation) that never blocks the accept.
**Constraints**: confirm-first (no model-initiated writes, spec FR-002/SC-002); tool loop hard cap 3 (FR-008); proposals sanitised before render (FR-010); idempotent migrations (FR-016/019); all carried constitution constraints (hexagonal, secrets, offline reads, stub-first).
**Scale/Scope**: single user. New: 1 port method + adapter loop, 2 ports (`ReflectionRepository`, `ChatSessionRepository`), 2 adapters, 3 commands (`ResolveProposal`, `SaveReflection`, `DeleteReflection` — plus reworked chat/summarize commands), 2 queries (`ListReflections`, `GetChatSessions`), ~8 IPC channel changes, 2 tables + migration, 1 domain module. Renderer: 2 stubs, 2 hooks, proposal card + sessions switcher in `CoachChat`, new Reflections section, touchable `FocusTask`.

### Carried caveat from specs 003/004

`better-sqlite3` Vitest runs need a Node-ABI build (the app targets Electron's ABI), so SQLite-repository tests may not run under plain `npm test`. The testable heart of this feature is pure: `domain/chat/proposal.ts` (sanitise/baseline/stale/apply), prompt builders + tool-payload validators, and the adapter loop against a fake `CreateMessage`. Repositories stay thin.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Principle IV — Hexagonal Architecture**: The tool loop lives in `adapters/driven/anthropic/` behind the existing `MatchCoachingModel` port (new method, same pattern). Proposal sanitisation/resolution is pure `domain/chat/proposal.ts` (zero imports). New persistence is two ports (`application/ports/`) + two SQLite adapters. `ResolveProposal`, `SaveReflection`, `DeleteReflection` are commands; `ListReflections`, `GetChatSessions` are queries; one IPC channel per use case, handlers thin. `domain/`/`application/` import no SDK or `electron`.
- [x] **Principle VI — Secrets in Main Process**: Unchanged surface — renderer sends ids/turns/decisions, receives DTOs. Briefing/context rebuilt server-side per call (existing pattern). No key crosses preload.
- [x] **Principle VIII — Frontend First**: New stubs `stubs/chatSessions.ts` (sessions, turns with pending/accepted/rejected/stale proposal cards) and `stubs/reflections.ts` (player/coach reflections with refs). `CoachChat` (proposal cards, session switcher), the Reflections section, and touchable `FocusTask` are built and reviewed against stubs across all card states **before** any IPC/backend work; wiring swaps stub imports for `window.api.*` with no layout change.
- [x] **Principle V — Test-First**: `proposal.test.ts` (sanitise: >3 tasks, non-computable metric, empty-set-by-omission, unknown ref id; baseline/stale; exactly-once resolution), `matchPrompts.test.ts` extension (tool schemas: canned valid/malformed payloads), adapter loop test (fake `CreateMessage`: rounds cap, plain-reply fallback), migration test (idempotency: run twice, count rows). All fixture-backed, no network.
- [x] **Principle VII — Offline-First**: Manual reflection CRUD and Accept/Reject are pure local SQLite operations (FR-014) — fully offline. Chat replies/proposals and distillation require connectivity, inherent to inference. All grounding reads stored data.

**Constitution-specific notes carried into design**

- **Principle II (evidence-grounded)**: proposal cards show full resulting state from *validated* payloads only; reflection refs must exist in the anchor catalog or standing set or they are dropped pre-render; task proposals must pass the metric registry. The model proposes — deterministic code disposes.
- **Focus tasks are measurable objects**: `update_tasks` tool payloads run through the same `GeneratedTask` validation as pass 4; non-computable metrics are dropped, and a proposal that drops below 1 task (when tasks exist) is suppressed entirely.
- **Honest about limits**: a tool-loop failure or cap-hit still yields a plain conversational reply (FR-008/FR-028); a stale accept is reported as stale, never silently re-applied.

## Project Structure

### Documentation (this feature)

```text
specs/005-agentic-coach-chat/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — loop design, proposal storage, migration, staleness
├── data-model.md        # Phase 1 — Reflection, ChatSession, ActionProposal, DTO/turn changes, schema
├── quickstart.md        # Phase 1 — stub-first build/verify walkthrough
├── contracts/           # Phase 1
│   ├── agentic-chat-tools.md   # chatAgentic port method, tool schemas, loop bounds, sanitisation
│   ├── ipc-chat-sessions.md    # session list/get/save channels + reworked coach:chat
│   ├── ipc-reflections.md      # reflection list/save/delete channels
│   └── ipc-resolve-proposal.md # proposal accept/reject channel + staleness rules
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
  main/
    domain/
      chat/
        proposal.ts               # NEW — sanitise model proposals, baseline signature, stale check, apply-resolution (pure)
      report/
        resolveChatRefs.ts        # EDIT — resolve `task:<id>` refs against the standing set (silent drop if gone)
        focusTask.ts              # REUSE — mergeStanding/enforceStandingSet validate task proposals
      memory/semanticObject.ts    # REUSE — mergeSemanticObjects for post-accept distillation
    application/
      ports/
        MatchCoachingModel.ts     # EDIT — add chatAgentic(briefing, history, extras, model) → {reply, proposal?}; add distill method (reuse summarizeReflection shape minus tasks)
        ReflectionRepository.ts   # NEW — list/save/delete reflections per match
        ChatSessionRepository.ts  # NEW — list metas / get / upsert session; resolve embedded proposal exactly-once
        ChatTranscriptRepository.ts # RETIRE from new flows (migration source only)
      commands/
        CoachChat.ts              # EDIT — session-aware; context += reflections block; calls chatAgentic; appends proposal turn
        ResolveProposal.ts        # NEW — re-validate, apply (tasks/reflections), mark resolved once, trigger distillation
        SaveReflection.ts         # NEW — manual create/edit (no model), refs validated server-side
        DeleteReflection.ts       # NEW
        SummarizeIntoReflection.ts# NEW — replaces FinalizeReflection: emits a reflection proposal turn (no writes)
        FinalizeReflection.ts     # REMOVE (logic redistributed: distillation → ResolveProposal; task changes → proposals)
      queries/
        ListReflections.ts        # NEW
        GetChatSessions.ts        # NEW — metas for switcher + single-session load
    adapters/
      driven/
        anthropic/
          AnthropicMatchCoachingModel.ts # EDIT — bounded tool loop for chatAgentic (≤3 rounds, plain-reply fallback)
          matchPrompts.ts                # EDIT — propose-tool schemas + payload validators + agentic system prompt (task-settling steer)
        sqlite/
          SqliteReflectionRepository.ts  # NEW
          SqliteChatSessionRepository.ts # NEW — exactly-once proposal resolution in a transaction
          schema.ts                      # EDIT — reflections + chat_sessions tables + idempotent legacy migration
      driving/
        IpcController.ts          # EDIT — new channels; retire chat:transcript:*/coach:reflection:finalize
    infrastructure/
      container.ts                # EDIT — wire new repos/commands/queries
  preload/
    index.ts                      # EDIT — expose new IpcApi surface
  shared/
    types.ts                      # EDIT — Reflection, ChatSessionMeta/ChatSession, ActionProposal (+ turn embed), EvidenceRef kind 'task', CoachChatReply { reply, proposalTurn? }, resolve DTOs; retire ReflectionOutcome
  renderer/src/
    stubs/
      chatSessions.ts             # NEW — sessions + proposal-card states (pending/accepted/rejected/stale) (Constitution VIII)
      reflections.ts              # NEW — player/coach reflections with refs
    data/
      useChatSessions.ts          # NEW — session list/switch/create-lazy + send + resolve
      useReflections.ts           # NEW — list/save/delete
    components/
      CoachChat.tsx               # EDIT — session switcher, proposal cards (Accept/Reject), "Summarize into a reflection" button (replaces finalize)
      coaching/
        ProposalCard.tsx          # NEW — task-set / reflection proposal card with resolution states
        ReflectionsPanel.tsx      # NEW — list + manual composer with pending-ref attach
        FocusTask.tsx             # EDIT — optional Askable wrapper (task:<id> evidence)
    screens/
      CoachReport.tsx             # EDIT — mount ReflectionsPanel; pass onAsk to FocusTask rows

test/
  unit/
    proposal.test.ts              # NEW — sanitise/baseline/stale/apply
    matchPrompts.test.ts          # EDIT — propose-tool validators
    AnthropicMatchCoachingModel.test.ts # EDIT — tool-loop bounds + fallback (fake CreateMessage)
    ResolveProposal.test.ts       # NEW — accept/reject/stale/double-accept with fake repos
    schemaMigration.test.ts       # NEW — legacy → sessions/reflections, idempotent (ABI caveat)
```

**Structure Decision**: Follows the fixed hexagonal layout from `technical_brief.md`. All new inference behaviour rides the existing `MatchCoachingModel` port/adapter pair; the only write path for model-initiated change is the `ResolveProposal` command; pure proposal logic is the testable heart. Renderer work is stub-first per Constitution VIII.

## Complexity Tracking

> No constitution violations. One deliberate softening of a spec-004 *invariant* (not a constitution principle), documented for transparency.

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Spec-004 "no free tool loops" invariant becomes "no *unbounded* tool loops" (hard cap 3 rounds, propose-only tools) | The feature's core ask — the model acting on intent (tasks vs reflections) — requires the model to choose actions; a fixed plan→fetch→respond shape cannot express "propose a task change when asked" | A second planning call classifying intent → fixed branch was considered; it duplicates the discovery-planner cost on every message, handles mixed intents poorly ("tighten the cs task and save that as a reflection"), and still needs payload generation — converging on the same bounded loop with more calls. Cost stays bounded and predictable: ≤3 light-tier rounds, propose-only tools, no side effects inside the loop. |
