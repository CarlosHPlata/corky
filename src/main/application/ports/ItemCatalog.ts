/**
 * Driven port: Riot item id → display name (3031 → "Infinity Edge"), so the
 * coach briefing speaks item NAMES to the model instead of numeric ids and the
 * factual match report always carries real names.
 *
 * The catalog is a hard dependency of MatchService.assembleReport: it MUST
 * always resolve to a populated map. Implementations layer a bundled snapshot,
 * a disk-persisted cache from prior runs, and a background Data Dragon refresh
 * — so names are available even offline, even on first launch, and never null.
 */
export interface ItemCatalog {
  getItemNames(): Promise<ReadonlyMap<number, string>>
}
