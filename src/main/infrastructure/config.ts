import { config as loadEnv } from 'dotenv'
import { join } from 'path'
import { app } from 'electron'

loadEnv({ path: join(app.getPath('userData'), '.env') })
loadEnv()

function require(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export const config = {
  riotApiKey: require('RIOT_API_KEY'),
  anthropicApiKey: require('ANTHROPIC_API_KEY'),
  riotId: require('RIOT_ID'),
  platform: process.env.PLATFORM ?? 'euw1',
  region: process.env.REGION ?? 'europe',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
  // Two-tier match analysis (spec 004): a cheap/fast model for the decoration
  // passes (caveats/framing, highlight narration) and a strong model for the
  // heavy passes (overall review, focus tasks). Overridable per environment.
  anthropicLightModel: process.env.CORKY_LIGHT_MODEL ?? 'claude-haiku-4-5',
  anthropicHeavyModel: process.env.CORKY_HEAVY_MODEL ?? 'claude-opus-4-8'
}
