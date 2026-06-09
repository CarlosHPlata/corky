# Contract: Session Coach — Player Intent Block (US2)

How the saved goal/notes reach the Quick Analysis coach. Confined to the application port signature + the Anthropic adapter; `domain/sessionFeatures.ts` is untouched.

## Port change — `SessionCoachingModel`

```ts
export interface PlayerContext {
  goal: string
  notes: string
}

export interface SessionCoachingModel {
  analyzeSession(
    features: SessionFeatures,
    model: string,
    playerContext?: PlayerContext   // NEW — omitted/undefined when no goal is set
  ): Promise<SessionAnalysisOutput>
}
```

- `playerContext` is plain data (no SDK types) — preserves Constitution IV.
- Optional and backward-compatible: existing callers/tests that pass two args still compile; behaviour with `playerContext` undefined is identical to today.

## Command change — `AnalyzeSession`

- Gains a `SessionGoalRepository` dependency (constructor-injected, after the existing args, defaulting to `null` to keep current tests green).
- Before calling the model: `const goal = this.goalRepo?.get() ?? null`. If `goal` and `hasContent(goal)`, build `playerContext = { goal: goal.goal, notes: goal.notes }`; else `undefined`.
- Pass `playerContext` as the third arg to `this.model.analyzeSession(features, this.modelName, playerContext)`.
- The goal is read **at analysis time**, so each run uses the latest saved text (FR-013); no caching of the goal in the analysis result.

## Adapter change — `AnthropicSessionCoachingModel` + `buildSessionPrompt`

`buildSessionPrompt(f: SessionFeatures, playerContext?: PlayerContext)` appends, **only when `playerContext` is present and non-empty**, a clearly-labelled block to the user message, e.g.:

```
The player has set their own goal & notes for this session — their stated intent, in their words (NOT a computed fact):
  Goal: <goal>
  Notes:
    - <note line 1>
    - <note line 2>
Treat this as the player's intent. Where the numbers above support it, speak to it directly and make the read about what they're working on. Do NOT put this text in an "evidence" chip, and do NOT invent any figure to make a leak fit the goal. If the data can't speak to their goal, say so plainly.
```

- When `playerContext` is absent (no goal set), **no block is added** and the prompt is byte-for-byte today's prompt (FR-010).
- Evidence chips still come only from `SessionFeatures` (Constitution II) — the block is intent, never a source of numbers.

## Test contract

`sessionPrompt.test.ts` (extended):
1. With a `playerContext` set → the user prompt contains the goal text and a "stated intent / NOT a computed fact" instruction.
2. With `playerContext` undefined → the user prompt equals the existing (no-intent) output; no "Goal:" line present.
3. Empty-string goal+notes passed as context → treated as absent (no block).

`AnalyzeSession.test.ts` (extended):
4. With a goal repo returning content → `analyzeSession` is called with a third `playerContext` arg carrying that goal/notes.
5. With no goal repo / empty goal → `analyzeSession` is called with `playerContext` undefined; result is unchanged from today.
