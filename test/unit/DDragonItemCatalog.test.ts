import { describe, it, expect, vi, afterEach } from 'vitest'
import { DDragonItemCatalog } from '../../src/main/adapters/driven/ddragon/DDragonItemCatalog'

const VERSIONS = ['15.12.1', '15.11.1']
const ITEMS = { data: { '3031': { name: 'Infinity Edge' }, '3340': { name: 'Stealth Ward' } } }

function okJson(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response
}

afterEach(() => vi.unstubAllGlobals())

describe('DDragonItemCatalog', () => {
  it('resolves id→name from the latest Data Dragon version and caches it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJson(VERSIONS))
      .mockResolvedValueOnce(okJson(ITEMS))
    vi.stubGlobal('fetch', fetchMock)

    const catalog = new DDragonItemCatalog()
    const names = await catalog.getItemNames()
    expect(names?.get(3031)).toBe('Infinity Edge')
    expect(fetchMock.mock.calls[1][0]).toContain('/cdn/15.12.1/data/en_US/item.json')

    await catalog.getItemNames() // cached — no further fetches
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('resolves null offline and retries (then caches) on the next call', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(okJson(VERSIONS))
      .mockResolvedValueOnce(okJson(ITEMS))
    vi.stubGlobal('fetch', fetchMock)

    const catalog = new DDragonItemCatalog()
    expect(await catalog.getItemNames()).toBeNull() // never rejects
    expect((await catalog.getItemNames())?.get(3340)).toBe('Stealth Ward')
  })

  it('shares one in-flight load across concurrent callers', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJson(VERSIONS))
      .mockResolvedValueOnce(okJson(ITEMS))
    vi.stubGlobal('fetch', fetchMock)

    const catalog = new DDragonItemCatalog()
    const [a, b] = await Promise.all([catalog.getItemNames(), catalog.getItemNames()])
    expect(a).toBe(b)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
