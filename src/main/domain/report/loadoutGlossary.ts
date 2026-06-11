// Pure. Static id→name glossary for the loadout facts the coach briefing
// renders — the chat model coaches off WORDS, not Riot's numeric ids.
// Summoner spells, keystones and rune trees are small, patch-stable sets, so
// they live in code (mirroring the renderer's offline fallbacks in
// Scoreboard.tsx). Item names churn every patch and are too many to hardcode:
// they come from Data Dragon via the ItemCatalog port instead, fetched by the
// orchestrating command and passed into the briefing builder.

const SUMMONER_SPELLS: Record<number, string> = {
  1: 'Cleanse', 3: 'Exhaust', 4: 'Flash', 6: 'Ghost', 7: 'Heal',
  11: 'Smite', 12: 'Teleport', 13: 'Clarity', 14: 'Ignite',
  21: 'Barrier', 32: 'Mark'
}

const KEYSTONES: Record<number, string> = {
  8005: 'Press the Attack', 8008: 'Lethal Tempo', 8010: 'Conqueror', 8021: 'Fleet Footwork',
  8112: 'Electrocute', 8128: 'Dark Harvest', 9923: 'Hail of Blades',
  8214: 'Summon Aery', 8229: 'Arcane Comet', 8230: 'Phase Rush',
  8351: 'Glacial Augment', 8360: 'Unsealed Spellbook', 8369: 'First Strike',
  8437: 'Grasp of the Undying', 8439: 'Aftershock', 8465: 'Guardian'
}

const RUNE_TREES: Record<number, string> = {
  8000: 'Precision', 8100: 'Domination', 8200: 'Sorcery', 8300: 'Inspiration', 8400: 'Resolve'
}

export function summonerSpellName(id: number): string | null {
  return SUMMONER_SPELLS[id] ?? null
}

export function keystoneName(id: number): string | null {
  return KEYSTONES[id] ?? null
}

export function runeTreeName(id: number): string | null {
  return RUNE_TREES[id] ?? null
}
