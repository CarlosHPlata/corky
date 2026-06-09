# Port Contract: `SessionCoachingModel`

Driven port (`src/main/application/ports/SessionCoachingModel.ts`). Implemented by `adapters/driven/anthropic/AnthropicSessionCoachingModel.ts`. The application layer depends only on this interface (Constitution IV).

## Interface
```ts
export interface SessionAnalysisOutput {
  insights: SessionInsight[]   // shape from shared/types
  noData: boolean
}

export interface SessionCoachingModel {
  analyzeSession(features: SessionFeatures, model: string): Promise<SessionAnalysisOutput>
}
```

## Behavioural contract
1. **Inputs are pre-computed facts.** The implementation MUST NOT fetch external data and MUST NOT invent any number not present in `features` (Constitution II, FR-006). All `evidence` strings echo values from `features`.
2. **Diagnose, don't describe (FR-004/FR-005).** Each insight pairs a flaw with a concrete next-game action. No insight may be a restatement of a visible headline stat (most-played champ, raw win rate, W/L count).
3. **Prioritize & cap (FR-003).** Return at most 4 insights, target 2–3, ordered by impact. Fewer is acceptable.
4. **Benchmark transparency (FR-011, SC-004).** When an insight cites a rate benchmark, set `benchmarkBasis` to the basis carried in `features.benchmarkBasis` (or a more specific basis the prompt is told to use). Otherwise `null`.
5. **Confidence (FR-014).** Mark an insight `provisional` when its supporting evidence rests on < 3 games.
6. **Altitude (FR-007).** When a flaw needs frame-level detail the session data lacks, the body says so and points to the per-game report — it does not fabricate specifics.
7. **Voice.** Blunt, direct, high-elo-coach tone (per the spec's voice decision).
8. **Failure.** On a malformed/empty model response the implementation throws (caller maps to FR-017). It does not return half-formed insights.

## Implementation note (adapter, not contract)
Uses forced tool-use (`submit_analysis`, schema = [llm-output.schema.json](./llm-output.schema.json)) so the model emits schema-shaped JSON natively (research R2). Prompt construction lives in `sessionPrompt.ts` and is unit-tested to ensure all `features` facts are serialized and the hard rules are present (Constitution V).

## Test contract
- Given a `SessionFeatures` fixture, a stubbed model returning a known tool-use payload yields the mapped `SessionAnalysisOutput` (no network).
- Given a malformed payload, `analyzeSession` rejects.
