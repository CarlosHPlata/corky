# Contract: IPC — Session Goal

Two new IPC channels, each mapping to one use case (Constitution IV: one channel per use case, thin handlers). Registered in `adapters/driving/IpcController.ts`, exposed via `preload/index.ts`, typed on `IpcApi` in `shared/types.ts`.

## Channel: `goal:get` (query → `GetSessionGoal`)

- **Direction**: renderer → main, read-only.
- **Request**: none.
- **Response**: `SessionGoal | null`
  - `null` when no goal has ever been saved (renderer shows the empty state).
- **Handler**: `ipcMain.handle('goal:get', () => deps.getSessionGoal.execute())`
- **Preload**: `getSessionGoal: (): Promise<SessionGoal | null> => ipcRenderer.invoke('goal:get')`

## Channel: `goal:save` (command → `SaveSessionGoal`)

- **Direction**: renderer → main, mutating.
- **Request**: `SessionGoalInput` — `{ goal: string; notes: string }` (raw text; main normalizes).
- **Response**: `SessionGoal` — the normalized, persisted record (so the renderer renders exactly what was stored, including trimming/caps).
- **Handler**: `ipcMain.handle('goal:save', (_e, input: SessionGoalInput) => deps.saveSessionGoal.execute(input))`
- **Preload**: `saveSessionGoal: (input: SessionGoalInput): Promise<SessionGoal> => ipcRenderer.invoke('goal:save', input)`

## `IpcApi` additions (`shared/types.ts`)

```ts
export interface IpcApi {
  // …existing…
  /** The saved session goal + notes, or null if never set. */
  getSessionGoal: () => Promise<SessionGoal | null>
  /** Persist the goal + notes (server trims + caps); returns the stored record. */
  saveSessionGoal: (input: SessionGoalInput) => Promise<SessionGoal>
}
```

## Behavioural contract

- `goal:save` MUST trim and cap before persisting (goal ≤ 200, notes ≤ 1000). Whitespace-only fields persist as `''`.
- `goal:save` with both fields empty is valid (clears the goal) and returns a record with `goal: '', notes: ''` and a fresh `updatedAt`.
- `goal:get` MUST NOT throw on a missing row — it returns `null`.
- Neither channel performs any network I/O.
