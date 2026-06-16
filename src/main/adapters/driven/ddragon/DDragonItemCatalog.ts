import { readFileSync, writeFile } from 'node:fs'
import type { ItemCatalog } from '../../../application/ports/ItemCatalog'
import { eventBus } from '../../../application/events/EventBus'
import { preview } from '../../../application/events/telemetry'

const BASE = 'https://ddragon.leagueoflegends.com'
const FETCH_TIMEOUT_MS = 5000

export type ItemSnapshot = { patch: string; items: Record<string, string> }

/**
 * Item id → name resolver. Layered so the report ALWAYS has real names:
 *   1. Bundled snapshot — shipped with the app, loaded at construction.
 *      Guarantees first-launch / fully-offline runs have names.
 *   2. Disk cache — written on every successful network refresh, read sync at
 *      construction. Overrides the bundled snapshot when present (fresher).
 *   3. Background network refresh — fired on the first `getItemNames` call,
 *      updates the in-memory map and persists to disk on success. Failures are
 *      logged but never surface to callers; the previous tier keeps serving.
 *
 * `getItemNames` returns synchronously from in-memory state — callers never
 * wait on the network, so a stalled DDragon never hangs the report path.
 */
export class DDragonItemCatalog implements ItemCatalog {
  private current: ReadonlyMap<number, string>
  private refreshStarted = false

  constructor(bundled: ItemSnapshot, private readonly diskPath: string | null) {
    const fromDisk = diskPath ? readSnapshotSync(diskPath) : null
    const chosen = fromDisk ?? bundled
    this.current = toMap(chosen.items)
  }

  async getItemNames(): Promise<ReadonlyMap<number, string>> {
    if (!this.refreshStarted) {
      this.refreshStarted = true
      void this.refreshFromNetwork()
    }
    return this.current
  }

  private async refreshFromNetwork(): Promise<void> {
    const started = Date.now()
    try {
      const snap = await this.fetchLatest()
      if (snap.items.size === 0) return
      this.current = snap.items
      if (this.diskPath) {
        const json = JSON.stringify({ patch: snap.patch, items: Object.fromEntries(snap.items) })
        writeFile(this.diskPath, json, () => { /* best-effort */ })
      }
    } catch (e) {
      eventBus.emit({
        type: 'telemetry.outbound', target: 'ddragon', name: 'DDragonItemCatalog', method: 'refresh',
        durationMs: Date.now() - started, ok: false,
        error: preview(e instanceof Error ? e.message : e, 200)
      })
    }
  }

  private async fetchLatest(): Promise<{ patch: string; items: ReadonlyMap<number, string> }> {
    const versions = (await (
      await fetch(`${BASE}/api/versions.json`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    ).json()) as string[]
    const patch = versions[0]
    const data = (await (
      await fetch(`${BASE}/cdn/${patch}/data/en_US/item.json`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    ).json()) as { data: Record<string, { name: string }> }
    const items = new Map<number, string>()
    for (const [id, entry] of Object.entries(data.data)) items.set(Number(id), entry.name)
    return { patch, items }
  }
}

function readSnapshotSync(path: string): ItemSnapshot | null {
  try {
    const raw = readFileSync(path, 'utf8')
    const snap = JSON.parse(raw) as ItemSnapshot
    if (snap && typeof snap.patch === 'string' && snap.items && Object.keys(snap.items).length > 0) {
      return snap
    }
    return null
  } catch {
    return null
  }
}

function toMap(items: Record<string, string>): ReadonlyMap<number, string> {
  const m = new Map<number, string>()
  for (const [id, name] of Object.entries(items)) m.set(Number(id), name)
  return m
}
