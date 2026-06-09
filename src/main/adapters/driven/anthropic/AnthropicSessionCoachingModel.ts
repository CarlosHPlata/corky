import Anthropic from '@anthropic-ai/sdk'
import type { SessionInsight, InsightLeak, BenchmarkBasis } from '@shared/types'
import type { SessionCoachingModel, SessionAnalysisOutput } from '../../../application/ports/SessionCoachingModel'
import type { SessionFeatures } from '../../../domain/sessionFeatures'
import { buildSessionPrompt, SUBMIT_TOOL } from './sessionPrompt'

interface ContentBlock {
  type: string
  name?: string
  input?: unknown
}

/** Minimal slice of the Anthropic client we depend on — keeps the adapter testable. */
export type CreateMessage = (params: Record<string, unknown>) => Promise<{ content: ContentBlock[] }>

const LEAKS = new Set<string>(['deaths', 'farming', 'lead_conversion', 'champion_pool', 'consistency', 'tempo'])
const BASES = new Set<string>(['champion_patch', 'rank_general', 'general'])

function nonEmpty(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

function validateInsight(raw: unknown): SessionInsight {
  if (!raw || typeof raw !== 'object') throw new Error('Coaching model returned a malformed insight')
  const o = raw as Record<string, unknown>
  const leak = nonEmpty(o.leak)
  const headline = nonEmpty(o.headline)
  const body = nonEmpty(o.body)
  const evidence = nonEmpty(o.evidence)
  if (!leak || !LEAKS.has(leak)) throw new Error(`Coaching model returned an invalid leak: ${String(o.leak)}`)
  if (!headline || !body || !evidence) throw new Error('Coaching model returned an insight missing required text')
  const benchmarkBasis =
    typeof o.benchmarkBasis === 'string' && BASES.has(o.benchmarkBasis) ? (o.benchmarkBasis as BenchmarkBasis) : null
  return {
    leak: leak as InsightLeak,
    headline,
    body,
    evidence,
    benchmarkBasis,
    confidence: o.confidence === 'provisional' ? 'provisional' : 'established'
  }
}

/** Validate and coerce the forced tool-use payload. Throws on anything unusable. */
export function parseSessionAnalysis(input: unknown): SessionAnalysisOutput {
  if (!input || typeof input !== 'object') throw new Error('Coaching model returned no analysis')
  const o = input as Record<string, unknown>
  const noData = o.noData === true
  const rawInsights = Array.isArray(o.insights) ? o.insights : []
  const insights = rawInsights.slice(0, 4).map(validateInsight)
  return { insights, noData }
}

/**
 * Session coach over Anthropic. Uses forced tool-use so the model emits
 * schema-shaped JSON natively (research R2). It only annotates the pre-computed
 * facts in `features`; the prompt forbids inventing numbers (Constitution II).
 */
export class AnthropicSessionCoachingModel implements SessionCoachingModel {
  constructor(private readonly createMessage: CreateMessage) {}

  /** Production constructor — wraps the real SDK behind the minimal CreateMessage. */
  static fromApiKey(apiKey: string): AnthropicSessionCoachingModel {
    const client = new Anthropic({ apiKey })
    const create: CreateMessage = (params) =>
      client.messages.create(
        params as unknown as Parameters<typeof client.messages.create>[0]
      ) as unknown as Promise<{ content: ContentBlock[] }>
    return new AnthropicSessionCoachingModel(create)
  }

  async analyzeSession(features: SessionFeatures, model: string): Promise<SessionAnalysisOutput> {
    const { system, user } = buildSessionPrompt(features)
    const message = await this.createMessage({
      model,
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
      tools: [SUBMIT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_analysis' }
    })
    const block = message.content.find((c) => c.type === 'tool_use' && c.name === 'submit_analysis')
    if (!block || block.input == null) {
      throw new Error('Coaching model did not return an analysis')
    }
    return parseSessionAnalysis(block.input)
  }
}
