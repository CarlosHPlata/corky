/**
 * Driven port: Riot item id → display name (3031 → "Infinity Edge"), so the
 * coach briefing can speak item NAMES to the model instead of numeric ids.
 * Resolution is best-effort: null when the catalog is unavailable (offline) —
 * callers degrade to raw ids. Implementations NEVER reject.
 */
export interface ItemCatalog {
  getItemNames(): Promise<ReadonlyMap<number, string> | null>
}
