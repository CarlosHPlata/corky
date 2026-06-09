import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = __dirname

/** Load a stored match-detail fixture (parsed raw match-v5 object). */
export function loadMatch(name: string): unknown {
  return JSON.parse(readFileSync(join(DIR, `match-${name}.json`), 'utf-8'))
}

/** Load a stored timeline fixture (parsed raw match-v5 timeline object). */
export function loadTimeline(name: string): unknown {
  return JSON.parse(readFileSync(join(DIR, `timeline-${name}.json`), 'utf-8'))
}

/** The player's puuid in every generated fixture. */
export const PLAYER_PUUID = 'PUUID_PLAYER'
