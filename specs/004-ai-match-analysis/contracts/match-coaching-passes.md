# Contract — `MatchCoachingModel` port (the four passes)

Single driven port; one adapter `AnthropicMatchCoachingModel` (forced tool-use, light/heavy tier injected). Each method takes a **compact context string** (never raw JSON, FR-026a) + typed extras, and returns a **validated** pass DTO. Pure prompt builders + validators live in `matchPrompts.ts` and are table-tested with a fake `CreateMessage` (canned tool-use → DTO; malformed → throws; off-catalog anchor dropped). Mirrors `AnthropicSessionCoachingModel` exactly.

```ts
interface MatchCoachingModel {
  analyzeFraming(ctx: string, model: string): Promise<FramingOutput>            // pass 1, light
  analyzeNarration(ctx: string, model: string): Promise<NarrationOutput>        // pass 2, light
  analyzeReview(ctx: string, extras: ReviewExtras, model: string): Promise<ReviewOutput>   // pass 3, heavy
  analyzeTasks(ctx: string, extras: TasksExtras, model: string): Promise<TasksOutput>      // pass 4, heavy
}
```

`ReviewExtras = { framing: string; narration: string; benchmark: BenchmarkRef | null; goal?: string; reflection?: string; external?: unknown /* pluggable, FR-026b — unused now */ }`.
`TasksExtras = { standing: FocusTask[]; sinceLast: FocusTaskEval[]; goal?: string; catalogMetricKeys: MetricKey[] }`.

## Per-pass contract

| Pass | Tool | `tool_choice` | max_tokens | thinking | Schema (input) | Validator drops/forbids |
|---|---|---|---|---|---|---|
| 1 framing | `submit_framing` | forced | ~700 | off | `{ headlineTag, headlineTagIntent, quickRead, mvp?, matchupTips[], captions? }` | invents a figure absent from ctx → reject; mvp on degenerate → null |
| 2 narration | `submit_narration` | forced | ~1200 | off | `{ highlightNarrations[], deathNarrations[], turningPoints[] }` each with `ref.id` | `ref.id` ∉ catalog → **drop** that item; positions/time taken from catalog, not model |
| 3 review | `submit_review` | forced | ~1500 | adaptive | `{ verdict{lead,gild}, claims[]{text,ref}, cohort, benchmarkBasis, confidence }` | structured claim with off-catalog `ref` → **drop**; figure not in ctx → reject; basis must equal the resolved benchmark basis |
| 4 tasks | `submit_tasks` | forced | ~1200 | adaptive | `{ standing[]{description,metric,comparator,target,scope,champion?,role?}, retire[] (ids) }` | `metric` not computable → **drop** task; clamp to 1–3; scope without champion/role → reject |

## Shared rules (every pass)

- **No invented figures** (Constitution II): the validator cross-checks any numeric the model emits against the compact context; unknown numbers reject the payload.
- **Hybrid anchoring** (FR-007): structured refs must be `stat:`/`marker:` ids from the catalog (drop if not); `benchmark:`/`note:` refs are typed free-form chips, allowed without a catalog entry.
- **No coaching in passes 1–2**: framing/narration are factual; coaching/verdict language belongs to pass 3 (disjoint sections, FR-002a). Validator is lenient on tone but the prompt forbids it.
- **Prose verdict** (pass 3): `verdict.lead`/`gild` carry prose; evidence is in `claims[]` — structured output, not free text (research D2).
- Adapter `static fromApiKey(apiKey)` wraps the SDK behind a minimal `CreateMessage` (the existing pattern); tests inject a fake.

## Prompt skeleton (per pass)

System: role + the pass's job + "annotate only the facts in the context; never invent numbers; cite anchor ids" + (passes 1–2) "no coaching language". User: the compact context (+ extras for 3/4). Tools: the single `submit_*` tool. `tool_choice` forces it. Read the `tool_use` block named `submit_*`; `parse*` validates → DTO or throws.

## Acceptance

- `matchPrompts.test`: each `parse*` turns a canned valid tool-use input into the DTO; a malformed/empty input throws; an off-catalog `ref` is dropped; an out-of-context figure is rejected; a non-computable task metric is dropped.
- SC-002/SC-003/SC-004: every structured review claim resolves to a catalog anchor; benchmark basis is tagged; every narration item matches its marker's time/side from the catalog.
