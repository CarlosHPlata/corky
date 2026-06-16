import { useCallback, useEffect, useRef, useState } from 'react'
import { MatchTimeline } from '../components/coaching/MatchTimeline'
import { CoachChat } from '../components/CoachChat'
import { ReflectionsPanel } from '../components/coaching/ReflectionsPanel'
import { Icon } from '../components/Icon'
import {
  SectionLabel, GatedBlock, UnavailableNote, CenteredNote,
  ReportVerdict, Scoreline, Matchup, Breakdown, DeathMap,
  TurningPoints, OverallAnalysis, WorkingOn, NextGameFocus, SinceLastGame, ReportControls,
  loadPins, savePins, toTimelineEvents,
} from '../components/coaching/report'
import { useMatchReport } from '../data/useMatchReport'
import { useMatchAnalysis } from '../data/useMatchAnalysis'
import { useProgress } from '../data/useProgress'
import { useReflections } from '../data/useReflections'
import { formatDuration } from '../utils/format'
import type { EvidenceRef } from '@shared/types'

// Corky desktop — Post-game report.
//
// Two layers live here:
//   • FACTUAL (spec 003) — scoreline, matchup, gold timeline + deterministic
//     highlights, the breakdown block, and the death map. Read straight off the
//     stored match via `getMatchReport`. No analysis needed.
//   • CORKY'S READ — the AI verdict, turning points, focus tasks and since-last.
//     Gated behind "Run analysis" and sourced from the four-pass pipeline.
//
// This screen is the orchestrator: it owns the data hooks, the cross-section
// wiring (chat refs, death↔timeline link, reflections) and the page layout.
// Every section's rendering lives in `../components/coaching/report`.

export function CoachReport({ matchId, onAnalyzed }: {
  matchId: string; analyzed?: boolean; onAnalyzed?: () => void
}) {
  const { report, loading, notFound, error } = useMatchReport(matchId)

  // AI analysis ("Corky's read"). Restored on open from the stored read (no model
  // call); runs the real four-pass pipeline on demand (spec 004).
  const { analysis, state, run, apply } = useMatchAnalysis(matchId)
  const analyzing = state === 'running'

  // What Corky's tracking across games (player-level semantic memory). Read-only,
  // model-free; the card hides itself when nothing is tracked yet.
  const { progress } = useProgress()
  const runAnalyze = (): void => run()
  // Notify the host once a read is in (keeps any host-level "analyzed" flag in sync).
  useEffect(() => { if (analysis?.review) onAnalyzed?.() }, [analysis?.review, onAnalyzed])

  // Death ↔ timeline link: the time (mins) of the death currently hovered/clicked
  // in the death map, so the timeline marks the same moment.
  const [activeDeathTime, setActiveDeathTime] = useState<number | null>(null)

  // Pending chat references — evidence the player picked off the report ("ask
  // Corky about this"). Lifted here so every report element can add, while the
  // chat composer renders/removes/sends them. Capped at 5 (the main-side
  // grounding cap); duplicate ids are no-ops. A ref mirror keeps `addRef` able
  // to report whether the add actually landed (drives the ✓-flash feedback).
  const [pendingRefs, setPendingRefs] = useState<EvidenceRef[]>([])
  const pendingMirror = useRef<EvidenceRef[]>([])
  const setPending = useCallback((next: EvidenceRef[]) => {
    pendingMirror.current = next
    setPendingRefs(next)
  }, [])
  useEffect(() => { pendingMirror.current = []; setPendingRefs([]) }, [matchId])
  const addRef = useCallback((ref: EvidenceRef): boolean => {
    const cur = pendingMirror.current
    if (cur.length >= 5 || cur.some(r => r.id === ref.id)) return false
    setPending(cur.concat({ ...ref }))
    return true
  }, [setPending])
  const removeRef = useCallback((id: string) => {
    setPending(pendingMirror.current.filter(r => r.id !== id))
  }, [setPending])
  const clearRefs = useCallback(() => { setPending([]) }, [setPending])

  // Reflections — the player's takeaways for this game (spec 005). Manual
  // authoring is model-free; coach-authored ones land via accepted proposals,
  // so the chat pings `reload` when one of its accepts touched the list.
  const reflectionsApi = useReflections(matchId)

  // "Add a reflection" from the aside controls: bump a signal the Reflections
  // panel listens to (opens its compose tile), then smooth-scroll the section
  // into view. Reset per game so switching matches never auto-opens it.
  const [reflectSignal, setReflectSignal] = useState(0)
  const reflectionsRef = useRef<HTMLElement>(null)
  useEffect(() => { setReflectSignal(0) }, [matchId])
  const startReflection = useCallback(() => {
    setReflectSignal((s) => s + 1)
    requestAnimationFrame(() => {
      const el = reflectionsRef.current
      if (!el) return
      const sc = el.closest('.ck-scroll') as HTMLElement | null
      if (!sc) return
      const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 16
      sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    })
  }, [])

  // Pin / save the game.
  const [pinned, setPinned] = useState(() => loadPins().includes(matchId))
  useEffect(() => { setPinned(loadPins().includes(matchId)) }, [matchId])
  const togglePin = useCallback(() => {
    const a = loadPins(); const i = a.indexOf(matchId)
    if (i >= 0) a.splice(i, 1); else a.push(matchId)
    savePins(a); setPinned(i < 0)
  }, [matchId])

  if (loading) {
    return <CenteredNote><Icon name="refresh-cw" size={18} className="ck-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />Loading this game…</CenteredNote>
  }
  if (error) {
    return <CenteredNote><Icon name="shield" size={18} style={{ color: 'var(--loss)', verticalAlign: 'middle', marginRight: 8 }} />Couldn’t read this match.</CenteredNote>
  }
  if (notFound || !report) {
    return <CenteredNote>That match isn’t stored locally. Sync your games and try again.</CenteredNote>
  }

  const core = report.core
  // Each pass owns its own section; a section is bound only when its pass produced
  // it (FR-002a). Unbuilt/failed/skipped sections fall back to the gated prompt.
  const framing = analysis?.framing ?? null
  const review = analysis?.review ?? null
  const narration = analysis?.narration ?? null
  const tasks = analysis?.tasks ?? null
  const analyzed = !!review

  return (
    <div style={{ padding: '22px 14px 60px 20px' }}>
      <div className="ck-report-grid">
        <div className="ck-report-main">
          <ReportVerdict core={core} review={review} framing={framing} analyzing={analyzing} onAnalyze={runAnalyze} />

          {/* Scoreline — facts; the MVP caption is a framing decoration (pass 1). */}
          <section>
            <SectionLabel icon="bar-chart-3">This game</SectionLabel>
            <Scoreline core={core} onAsk={addRef} />
            {framing?.mvp && (
              <div style={{ marginTop: 8, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-muted)' }}>
                <Icon name="sparkles" size={13} style={{ color: 'var(--gold-400)', verticalAlign: 'middle', marginRight: 6 }} />
                MVP: <strong style={{ color: 'var(--text-secondary)' }}>{framing.mvp.champion}{framing.mvp.isYou ? ' (you)' : ''}</strong> — {framing.mvp.justification}
              </div>
            )}
          </section>

          {/* Reflections — the player's takeaways for this game (spec 005). Not
              gated on analysis: manual authoring needs no model and works offline. */}
          <section ref={reflectionsRef}>
            <SectionLabel icon="bookmark">Reflections</SectionLabel>
            <ReflectionsPanel
              reflections={reflectionsApi.reflections}
              pendingRefs={pendingRefs}
              startSignal={reflectSignal}
              onSave={reflectionsApi.save}
              onDelete={reflectionsApi.remove}
              onRemoveRef={removeRef}
              onClearRefs={clearRefs}
            />
          </section>
          
          {/* Matchup — facts; the tips are a framing decoration (pass 1). */}
          <section>
            <SectionLabel icon="swords">Matchup</SectionLabel>
            <Matchup matchup={report.matchup} win={core.win} mvp={framing?.mvp ?? null} />
            {framing && framing.matchupTips.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {framing.matchupTips.map((tip, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-muted)' }}>
                    <Icon name="sparkles" size={13} style={{ color: 'var(--gold-400)', flex: 'none', marginTop: 2 }} />{tip}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Evidence — timeline + breakdown + death map (all facts) */}
          <section>
            <SectionLabel icon="target">Evidence</SectionLabel>
            {report.timelineAvailable && report.timeline ? (
              <div style={{ marginBottom: 14 }}>
                <MatchTimeline
                  duration={formatDuration(core.durationSec)}
                  curve={report.timeline.frames.map(f => f.goldDiff / 1000)}
                  events={toTimelineEvents(report.timeline.highlights)}
                  markerTime={activeDeathTime}
                  onAskEvent={addRef}
                />
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}><UnavailableNote what="The game timeline" /></div>
            )}
            <div style={{ marginBottom: 14 }}>
              <Breakdown b={report.breakdown} onAsk={addRef} />
            </div>
            {report.deathMap
              ? <DeathMap dm={report.deathMap} narrations={narration?.deathNarrations} onActiveDeath={setActiveDeathTime} onAsk={addRef} />
              : <UnavailableNote what="The death map" />}
          </section>

          <section>
            <SectionLabel icon="map" count={narration ? `${narration.turningPoints.length} moments` : undefined}>Turning points</SectionLabel>
            <TurningPoints narration={narration} timelineAvailable={report.timelineAvailable} analyzing={analyzing} onAnalyze={runAnalyze} />
          </section>

          <section>
            <SectionLabel icon="sparkles">Overall analysis</SectionLabel>
            <OverallAnalysis review={review} win={core.win} analyzing={analyzing} onAnalyze={runAnalyze} />
          </section>

          {/* What Corky's working on — cross-game patterns/weaknesses (player-level
              memory, not this game). Self-hides until something is tracked. */}
          {progress && progress.working.length > 0 && (
            <section>
              <SectionLabel icon="eye">What Corky’s working on</SectionLabel>
              <WorkingOn working={progress.working} />
            </section>
          )}

          <section>
            <SectionLabel icon="crosshair">Next-game focus</SectionLabel>
            <NextGameFocus tasks={tasks} analyzing={analyzing} onAnalyze={runAnalyze} onAsk={addRef} />
          </section>

          <section>
            <SectionLabel icon="history">Since last game</SectionLabel>
            <SinceLastGame tasks={tasks} analyzing={analyzing} onAnalyze={runAnalyze} />
          </section>

        </div>{/* /.ck-report-main */}

        {/* Right sidebar — sticky controls + coaching chat */}
        <aside className="ck-report-aside">
          <section className="ck-controls-sec">
            <SectionLabel icon="settings">Controls</SectionLabel>
            <ReportControls analyzed={analyzed} analyzing={analyzing} onAnalyze={runAnalyze}
              pinned={pinned} onTogglePin={togglePin} onAddReflection={startReflection} />
          </section>

          {/* Coach Corky — a live coaching chat, gated behind analysis. Keyed by
              match so an in-flight reply for game A never lands in game B. */}
          <section>
            <SectionLabel icon="message-circle">Coach Corky</SectionLabel>
            {analyzed
              ? <CoachChat key={matchId} matchId={matchId} core={core} review={review} standing={tasks?.standing ?? []}
                  onTasksUpdated={apply} onReflectionsChanged={reflectionsApi.reload}
                  pendingRefs={pendingRefs} onRemoveRef={removeRef} onClearRefs={clearRefs} />
              : <GatedBlock title="Talk this game through with Corky"
                  hint="Run analysis and Corky can settle your next-game focus, then save reflections straight to the board."
                  analyzing={analyzing} onAnalyze={runAnalyze} />}
          </section>
        </aside>
      </div>{/* /.ck-report-grid */}
    </div>
  )
}
