import type { ItemCatalog } from '../../../application/ports/ItemCatalog'
import { eventBus } from '../../../application/events/EventBus'
import { preview } from '../../../application/events/telemetry'

const BASE = 'https://ddragon.leagueoflegends.com'
const TIMEOUT_MS = 5000

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
      const started = Date.now()
      this.inflight = this.load()
        .then((names) => {
          this.cache = names
          return names
        })
        .catch((e) => {
          // The null fallback degrades the briefing to a no-item-names mode —
          // make the WHY visible instead of silently swallowing it.
          eventBus.emit({
            type: 'telemetry.outbound', target: 'ddragon', name: 'DDragonItemCatalog', method: 'load',
            durationMs: Date.now() - started, ok: false,
            error: preview(e instanceof Error ? e.message : e, 200)
          })
          return null
        })
        .finally(() => {
          this.inflight = null
        })
    }
    return this.inflight
  }

  private async load(): Promise<ReadonlyMap<number, string>> {
    const versions = (await (
      await fetch(`${BASE}/api/versions.json`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    ).json()) as string[]
    const items = (await (
      await fetch(`${BASE}/cdn/${versions[0]}/data/en_US/item.json`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    ).json()) as {
      data: Record<string, { name: string }>
    }
    return new Map(Object.entries(items.data).map(([id, entry]) => [Number(id), entry.name]))
  }
}
