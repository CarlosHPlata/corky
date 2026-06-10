const BASE = 'https://ddragon.leagueoflegends.com'

interface DDChampEntry {
  id: string
  name: string
  image: { full: string }
}

interface DDItemEntry {
  name: string
}

interface DDSummonerEntry {
  name: string
  key: string
  image: { full: string }
}

interface DDRuneStyle {
  id: number
  name: string
  icon: string
  slots: { runes: { id: number; name: string; icon: string }[] }[]
}

// Module-level cache — loaded once per renderer session.
let version: string | null = null
let nameToImage: Map<string, string> | null = null
let loadPromise: Promise<void> | null = null

// Loadout data (items / summoner spells / runes), loaded lazily on first
// scoreboard render. Everything degrades to null offline — callers fall back
// to the static code maps below.
let itemById: Map<number, string> | null = null
let spellById: Map<number, { name: string; image: string }> | null = null
let runeById: Map<number, { name: string; icon: string }> | null = null
let styleById: Map<number, { name: string; icon: string }> | null = null
let loadoutPromise: Promise<void> | null = null

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

async function loadLoadoutData(): Promise<void> {
  await ensureDDLoaded()
  const [items, spells, runes] = await Promise.all([
    fetch(`${BASE}/cdn/${version}/data/en_US/item.json`).then(r => r.json()) as Promise<{ data: Record<string, DDItemEntry> }>,
    fetch(`${BASE}/cdn/${version}/data/en_US/summoner.json`).then(r => r.json()) as Promise<{ data: Record<string, DDSummonerEntry> }>,
    fetch(`${BASE}/cdn/${version}/data/en_US/runesReforged.json`).then(r => r.json()) as Promise<DDRuneStyle[]>
  ])

  itemById = new Map()
  for (const [id, entry] of Object.entries(items.data)) itemById.set(Number(id), entry.name)

  spellById = new Map()
  for (const entry of Object.values(spells.data)) {
    spellById.set(Number(entry.key), { name: entry.name, image: entry.image.full })
  }

  runeById = new Map()
  styleById = new Map()
  for (const style of runes) {
    styleById.set(style.id, { name: style.name, icon: style.icon })
    for (const slot of style.slots) {
      for (const rune of slot.runes) runeById.set(rune.id, { name: rune.name, icon: rune.icon })
    }
  }
}

export function ensureDDLoaded(): Promise<void> {
  if (!loadPromise) loadPromise = load()
  return loadPromise
}

/** Item / spell / rune metadata for the matchup scoreboard. Never rejects —
 * offline the maps stay null and lookups return null. */
export function ensureLoadoutDataLoaded(): Promise<void> {
  if (!loadoutPromise) loadoutPromise = loadLoadoutData().catch(() => undefined)
  return loadoutPromise
}

export function champImgUrl(displayName: string): string | null {
  if (!version || !nameToImage) return null
  const file = nameToImage.get(displayName)
  if (!file) return null
  return `${BASE}/cdn/${version}/img/champion/${file}`
}

export function profileIconUrl(iconId: number): string | null {
  if (!version) return null
  return `${BASE}/cdn/${version}/img/profileicon/${iconId}.png`
}

export function itemName(id: number): string | null {
  return itemById?.get(id) ?? null
}

export function itemImgUrl(id: number): string | null {
  if (!version || !itemById?.has(id)) return null
  return `${BASE}/cdn/${version}/img/item/${id}.png`
}

export function spellName(id: number): string | null {
  return spellById?.get(id)?.name ?? null
}

export function spellImgUrl(id: number): string | null {
  const file = spellById?.get(id)?.image
  return version && file ? `${BASE}/cdn/${version}/img/spell/${file}` : null
}

export function runeName(id: number): string | null {
  return runeById?.get(id)?.name ?? null
}

/** Perk icons live under a version-less CDN path. */
export function runeImgUrl(id: number): string | null {
  const icon = runeById?.get(id)?.icon
  return icon ? `${BASE}/cdn/img/${icon}` : null
}

export function styleName(id: number): string | null {
  return styleById?.get(id)?.name ?? null
}

export function styleImgUrl(id: number): string | null {
  const icon = styleById?.get(id)?.icon
  return icon ? `${BASE}/cdn/img/${icon}` : null
}
