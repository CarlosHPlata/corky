# IPC Contract: `analysis:session`

The renderer's driving-port contract for Quick Analysis. One channel, one use case (Constitution IV).

## Channel
`analysis:session`

## Preload surface (`src/preload/index.ts`)
```ts
getSessionAnalysis: (): Promise<SessionAnalysis> => ipcRenderer.invoke('analysis:session')
```
Added to the `IpcApi` interface in `src/shared/types.ts`.

## Main handler (`src/main/adapters/driving/IpcController.ts`)
```ts
ipcMain.handle('analysis:session', () => deps.getSessionAnalysis.execute())
```
Thin: validate (no args) → call query → return DTO. No domain logic in the handler.

## Request
No parameters. The query reads the latest synced data from local repositories.

## Response — `SessionAnalysis`
```jsonc
{
  "insights": [
    {
      "leak": "lead_conversion",
      "headline": "You win lane and lose the game",
      "body": "Across your losses your KDA is fine — the LP bleeds after 20 minutes. Next game: when you're ahead at 15, group and take a tower instead of farming side lane for one more kill.",
      "evidence": "avgKDA 3.1 · 38% WR",
      "benchmarkBasis": null,
      "confidence": "established"
    }
  ],
  "noData": false,
  "benchmarkBasisUsed": "champion_patch",
  "generatedAt": 1749470000000,
  "model": "claude-sonnet-4-6"
}
```

### Empty / honest states
- **No games**: `{ "insights": [], "noData": true, "benchmarkBasisUsed": "general", ... }` → renderer shows "needs games" (FR-015).
- **Nothing firm to say** (rare): `noData: false`, `insights` may contain only `provisional` items.

## Errors
The handler **throws** on coaching-service failure or unusable model output. The renderer catches via the hook and shows a retryable error (FR-017, SC-007). The error message is non-technical/user-safe. Benchmark unavailability does **not** error — it falls back (FR-011); only the LLM call failing (or returning unparseable output) errors.

## Performance
Completes within ~10s (SC-001). The OP.GG fetch is **not** on this path — benchmarks are prefetched/cached on sync (FR-013). No credential crosses the boundary (Constitution VI).

## Acceptance mapping
FR-001 (trigger), FR-003 (2–3 insights), FR-015 (noData), FR-017 (error), FR-020 (no secrets), FR-022 (existing card shape).
