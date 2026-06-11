import type { ItemCatalog } from '../../../application/ports/ItemCatalog'

const BASE = 'https://ddragon.leagueoflegends.com'

/**
 * Data Dragon-backed item glossary — the main-process twin of the renderer's
 * ddragon.ts lookups. Two small static-CDN fetches (latest version, then
 * item.json) on first use, cached in memory for the rest of the app run.
 * A failed load resolves null (the briefing degrades to raw item ids) and the
 * next call retries, so a temporarily offline start heals itself.
 */
export class DDragonItemCatalog implements ItemCatalog {
  private cache: ReadonlyMap<number, string> | null = null
  private inflight: Promise<ReadonlyMap<number, string> | null> | null = null

  async getItemNames(): Promise<ReadonlyMap<number, string> | null> {
    if (this.cache) return this.cache
    if (!this.inflight) {
      this.inflight = this.load()
        .then((names) => {
          this.cache = names
          return names
        })
        .catch(() => null)
        .finally(() => {
          this.inflight = null
        })
    }
    return this.inflight
  }

  private async load(): Promise<ReadonlyMap<number, string>> {
    const versions = (await (await fetch(`${BASE}/api/versions.json`)).json()) as string[]
    const items = (await (await fetch(`${BASE}/cdn/${versions[0]}/data/en_US/item.json`)).json()) as {
      data: Record<string, { name: string }>
    }
    return new Map(Object.entries(items.data).map(([id, entry]) => [Number(id), entry.name]))
  }
}
