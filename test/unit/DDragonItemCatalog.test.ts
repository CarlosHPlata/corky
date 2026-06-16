import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DDragonItemCatalog, type ItemSnapshot } from '../../src/main/adapters/driven/ddragon/DDragonItemCatalog'

const BUNDLED: ItemSnapshot = {
  patch: '15.10.1',
  items: { '3031': 'Infinity Edge', '3340': 'Stealth Ward' }
}

const NETWORK_VERSIONS = ['16.12.1', '16.11.1']
const NETWORK_ITEMS = { data: { '3031': { name: 'Infinity Edge' }, '7000': { name: 'New Patch Item' } } }

function okJson(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ddragon-test-'))
})
afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(tmp, { recursive: true, force: true })
})

describe('DDragonItemCatalog', () => {
  it('serves bundled snapshot immediately — first call returns synchronously', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => { /* never */ })))
    const catalog = new DDragonItemCatalog(BUNDLED, null)
    const names = await catalog.getItemNames()
    expect(names.get(3031)).toBe('Infinity Edge')
  })

  it('prefers a disk-cached snapshot over the bundled one at construction', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => { /* never */ })))
    const diskPath = join(tmp, 'cache.json')
    writeFileSync(
      diskPath,
      JSON.stringify({ patch: '16.10.1', items: { '3031': 'IE (disk)', '9999': 'Fresh Item' } })
    )
    const catalog = new DDragonItemCatalog(BUNDLED, diskPath)
    const names = await catalog.getItemNames()
    expect(names.get(3031)).toBe('IE (disk)')
    expect(names.get(9999)).toBe('Fresh Item')
  })

  it('refreshes from the network on first call and persists to disk', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJson(NETWORK_VERSIONS))
      .mockResolvedValueOnce(okJson(NETWORK_ITEMS))
    vi.stubGlobal('fetch', fetchMock)

    const diskPath = join(tmp, 'cache.json')
    const catalog = new DDragonItemCatalog(BUNDLED, diskPath)

    // First call returns bundled (refresh fires in background).
    expect((await catalog.getItemNames()).get(7000)).toBeUndefined()

    // Let the background refresh + persist complete.
    await tick(); await tick(); await tick()

    expect((await catalog.getItemNames()).get(7000)).toBe('New Patch Item')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toContain('/cdn/16.12.1/data/en_US/item.json')

    const persisted = JSON.parse(readFileSync(diskPath, 'utf8'))
    expect(persisted.patch).toBe('16.12.1')
    expect(persisted.items['7000']).toBe('New Patch Item')
  })

  it('keeps serving the previous tier when the network refresh fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    const catalog = new DDragonItemCatalog(BUNDLED, null)
    expect((await catalog.getItemNames()).get(3031)).toBe('Infinity Edge')
    await tick(); await tick()
    // Still bundled, no throw.
    expect((await catalog.getItemNames()).get(3031)).toBe('Infinity Edge')
  })

  it('only kicks off one background refresh across many concurrent calls', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJson(NETWORK_VERSIONS))
      .mockResolvedValueOnce(okJson(NETWORK_ITEMS))
    vi.stubGlobal('fetch', fetchMock)

    const catalog = new DDragonItemCatalog(BUNDLED, null)
    await Promise.all([catalog.getItemNames(), catalog.getItemNames(), catalog.getItemNames()])
    await tick(); await tick()
    expect(fetchMock).toHaveBeenCalledTimes(2) // versions + items, not 6
  })
})
