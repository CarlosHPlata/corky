// DEBUG HARNESS (not a real test — delete after root-causing the review failure).
// Rebuilds the exact analyzeReview prompt for the failing match from a DB dump
// (scripts/dump-match.cjs) and, with CORKY_REPRO_CALL=1, replays the API call
// and dumps the raw response (stop_reason, usage, tool input).
import { describe, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { assembleMatchReport } from '../../src/main/domain/report/assembleMatchReport'
import { buildAnchorCatalog } from '../../src/main/domain/report/anchorCatalog'
import { renderContextBlocks } from '../../src/main/domain/report/contextBlocks'
import { resolveConfig } from '../../src/main/domain/config/coachingConfig'
import { resolveGeneralBenchmark } from '../../src/main/domain/benchmark'
import { buildReviewPrompt, parseReview, SUBMIT_REVIEW } from '../../src/main/adapters/driven/anthropic/matchPrompts'
import type { FramingOutput, NarrationOutput } from '../../src/shared/types'

const DUMP = join(process.env.TEMP ?? '/tmp', 'corky-debug', 'match-dump.json')

describe('review repro', () => {
  it.skipIf(!existsSync(DUMP))('rebuilds the failing review prompt', async () => {
    const dump = JSON.parse(readFileSync(DUMP, 'utf8'))
    const rawMatch = JSON.parse(dump.match.raw_json)
    const rawTimeline = dump.timeline ? JSON.parse(dump.timeline.raw_json) : null
    const puuid = dump.account.puuid

    const report = assembleMatchReport(rawMatch, rawTimeline, puuid, new Map())
    const catalog = buildAnchorCatalog(report)

    const config = resolveConfig(dump.config ? JSON.parse(dump.config.json) : undefined)
    const disabled = new Set(config.sources.filter((s) => !s.enabled).map((s) => s.id))
    const enabledIds = new Set(
      config.blocks
        .filter((b) => b.enabled && !(b.requiresSource && disabled.has(b.requiresSource)))
        .map((b) => b.id)
    )
    const goal = enabledIds.has('player.goal') ? dump.goal?.goal?.trim() || undefined : undefined
    const reflection = enabledIds.has('player.reflection')
      ? dump.reflections?.[0]?.text?.trim() || undefined
      : undefined
    const ctx = renderContextBlocks(report, catalog, { goal, reflection }, enabledIds)

    // Stored partial: framing + narration reused exactly as AnalyzeMatch does.
    const analysis = JSON.parse(dump.analysis.json)
    const f = analysis.framing as FramingOutput
    const n = analysis.narration as NarrationOutput
    const framingSummary = `quick="${f.quickRead}"${f.mvp ? ` mvp="${f.mvp.champion}${f.mvp.isYou ? ' (you)' : ''}"` : ''}`
    const narrationSummary = n.turningPoints
      .slice(0, 3)
      .map((t) => `${t.time} ${t.swing}: ${t.what}`)
      .join(' | ')

    const tier = dump.profile ? JSON.parse(dump.profile.json ?? '{}')?.soloRank?.tier ?? null : null
    const benchmark = { metric: 'cs_per_min', basis: 'general' as const, ref: resolveGeneralBenchmark(tier).csPerMin }

    const { system, user } = buildReviewPrompt(ctx, {
      framing: framingSummary,
      narration: narrationSummary,
      benchmark,
      goal,
      reflection
    })

    const outDir = join(process.env.TEMP ?? '/tmp', 'corky-debug')
    writeFileSync(join(outDir, 'review-system.txt'), system)
    writeFileSync(join(outDir, 'review-user.txt'), user)
    console.log('system chars:', system.length, '| user chars:', user.length)

    if (process.env.CORKY_REPRO_CALL !== '1') return

    const envText = readFileSync(join(process.env.APPDATA!, 'corky', '.env'), 'utf8')
    const apiKey = /ANTHROPIC_API_KEY=(\S+)/.exec(envText)?.[1]
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
      tools: [SUBMIT_REVIEW as never],
      tool_choice: { type: 'tool', name: 'submit_review' }
    })
    writeFileSync(join(outDir, 'review-response.json'), JSON.stringify(message, null, 2))
    console.log('stop_reason:', message.stop_reason)
    console.log('usage:', JSON.stringify(message.usage))
    console.log('tool_use blocks:', message.content.filter((b) => b.type === 'tool_use').length)
    const first = message.content.find((b) => b.type === 'tool_use')
    if (first && first.type === 'tool_use') {
      console.log('tool input keys:', Object.keys(first.input as object))
      const parsed = parseReview(first.input)
      console.log('parsed verdict lead:', parsed.verdict.lead)
      console.log('parsed claims:', parsed.claims.length)
    }
  }, 120000)
})
