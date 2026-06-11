import { eventBus } from '../application/events/EventBus'

/**
 * The default telemetry observer: renders bus events as compact console
 * lines. Purely a subscriber — swap or stack others (file, OTLP, in-app
 * debug panel) without touching emitters.
 *
 *   [app] CoachChat.execute ok 1240ms
 *   [out:sqlite] MatchRepository.getMatchDetail ok 2ms
 *   [out:opgg-mcp] OpggMcpClient.lol_get_champion_analysis miss ok 320ms → LolGetChampionAnalysis(Data(Runes("Domination"…
 *   [discovery] plan "was my build ok?" → champion_build, lane_matchup
 *   [discovery] champion_build via opgg-mcp ok 1 line(s) | BUILD champ=Ekko pos=MID …
 */
export function registerTelemetryConsoleLogger(): void {
  eventBus.on('telemetry.app', (e) => {
    const status = e.ok ? 'ok' : `FAIL ${e.error ?? ''}`
    console.log(`[app] ${e.name}.${e.method} ${status} ${e.durationMs}ms`)
  })

  eventBus.on('telemetry.outbound', (e) => {
    const cache = e.cache ? ` ${e.cache}` : ''
    const status = e.ok ? 'ok' : `FAIL ${e.error ?? ''}`
    const out = e.preview ? ` → ${e.preview}` : ''
    console.log(`[out:${e.target}] ${e.name}.${e.method}${cache} ${status} ${e.durationMs}ms${out}`)
  })

  eventBus.on('telemetry.discovery.plan', (e) => {
    if (e.error) {
      console.log(`[discovery] plan FAILED for "${e.question}": ${e.error}`)
      return
    }
    const kinds = e.requests.length
      ? e.requests.map((r) => (r.query ? `${r.kind}("${r.query}")` : r.kind)).join(', ')
      : '(nothing)'
    console.log(`[discovery] plan "${e.question}" → ${kinds}`)
  })

  eventBus.on('telemetry.discovery.fetch', (e) => {
    const status = e.ok ? 'ok' : 'EMPTY'
    const sample = e.lines.length ? ` | ${e.lines.join(' | ')}` : ''
    console.log(`[discovery] ${e.kind} via ${e.source} ${status} ${e.lines.length} line(s)${sample}`)
  })
}
