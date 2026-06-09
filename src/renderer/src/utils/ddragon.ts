const BASE = 'https://ddragon.leagueoflegends.com'

interface DDChampEntry {
  id: string
  name: string
  image: { full: string }
}

// Module-level cache — loaded once per renderer session.
let version: string | null = null
let nameToImage: Map<string, string> | null = null
let loadPromise: Promise<void> | null = null

async function load(): Promise<void> {
  const versions = await fetch(`${BASE}/api/versions.json`).then(r => r.json() as Promise<string[]>)
  version = versions[0]

  const json = await fetch(`${BASE}/cdn/${version}/data/en_US/champion.json`).then(r => r.json()) as {
    data: Record<string, DDChampEntry>
  }

  nameToImage = new Map()
  for (const entry of Object.values(json.data)) {
    // Index by display name ("Lee Sin") AND by DD key ("LeeSin") for resilience.
    nameToImage.set(entry.name, entry.image.full)
    nameToImage.set(entry.id, entry.image.full)
  }
}

export function ensureDDLoaded(): Promise<void> {
  if (!loadPromise) loadPromise = load()
  return loadPromise
}

export function champImgUrl(displayName: string): string | null {
  if (!version || !nameToImage) return null
  const file = nameToImage.get(displayName)
  if (!file) return null
  return `${BASE}/cdn/${version}/img/champion/${file}`
}
