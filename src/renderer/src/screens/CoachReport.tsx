import React, { useEffect, useRef, useState } from 'react'
import { VerdictCard } from '../components/coaching/VerdictCard'
import { FocusTask } from '../components/coaching/FocusTask'
import { TurningPoint } from '../components/coaching/TurningPoint'
import { MatchTimeline } from '../components/coaching/MatchTimeline'
import { Badge } from '../components/core/Badge'
import { Card } from '../components/core/Card'
import { StatBlock } from '../components/core/StatBlock'
import { Button } from '../components/core/Button'
import { ChampAvatar } from '../components/ChampAvatar'
import { Icon } from '../components/Icon'
import { useMatchReport } from '../data/useMatchReport'
import { formatDuration, queueLabel } from '../utils/format'
import { REPORT_LOSS, REPORT_WIN } from '../data/mockData'
import type {
  MatchReport, MatchCore, Matchup as MatchupData, Breakdown as BreakdownData,
  GoldTimeline, DeathMap as DeathMapData, Highlight, RosterEntry,
} from '@shared/types'

// Corky desktop — Post-game report.
//
// Two layers live here:
//   • FACTUAL (this feature, spec 003) — scoreline, matchup, gold timeline +
//     deterministic highlights, the breakdown block, and the death map. Read
//     straight off the stored match via `getMatchReport`. No analysis needed.
//   • CORKY'S READ — the AI verdict, turning points, focus tasks and since-last.
//     Still gated behind "Run analysis" and sourced from the mock layer until
//     Flow A wires it. This feature does NOT feed those sections.

const ROLE_ABBR: Record<string, string> = {
  Top: 'TOP', Jungle: 'JNG', Mid: 'MID', Bot: 'BOT', Support: 'SUP',
}

function fmtClock(tMin: number): string {
  const m = Math.floor(tMin)
  const s = Math.round((tMin - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function goldK(gold: number): string {
  return (gold / 1000).toFixed(1) + 'k'
}

function goldDiffK(n: number): string {
  return (n >= 0 ? '+' : '−') + Math.abs(n / 1000).toFixed(1) + 'k'
}

function SectionLabel({ icon, children, count }: { icon?: string; children: React.ReactNode; count?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 0 12px' }}>
      {icon && <Icon name={icon} size={16} style={{ color: 'var(--gold-400)' }} />}
      <span className="eyebrow" style={{ fontSize: 12 }}>{children}</span>
      {count != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)' }}>{count}</span>}
    </div>
  )
}

// Inline "run analysis to see this" placeholder — stands in for any AI-written block.
function GatedBlock({ title, hint, analyzing, onAnalyze }: { title: string; hint: string; analyzing: boolean; onAnalyze: () => void }) {
  return (
    <div className="ck-gated">
      <span className="ck-gated__icon"><Icon name={analyzing ? 'refresh-cw' : 'sparkles'} size={19} className={analyzing ? 'ck-spin' : ''} /></span>
      <div className="ck-gated__body">
        <div className="ck-gated__dots">· · · · ·</div>
        <div className="ck-gated__title">{title}</div>
        <div className="ck-gated__hint">{hint}</div>
      </div>
      <Button variant="secondary" size="sm" onClick={onAnalyze} disabled={analyzing}
        iconLeft={<Icon name={analyzing ? 'refresh-cw' : 'sparkles'} size={14} className={analyzing ? 'ck-spin' : ''} />}
        style={{ flex: 'none' }}>
        {analyzing ? 'Analysing…' : 'Run analysis'}
      </Button>
    </div>
  )
}

// ── FACTUAL: scoreline economy (US2) ─────────────────────────────────────────
function Scoreline({ core }: { core: MatchCore }) {
  const stats = [
    { label: 'KDA', value: core.kdaRatio.toFixed(2), caption: `${core.kills} / ${core.deaths} / ${core.assists}` },
    { label: 'CS', value: String(core.cs), caption: `${core.role.toLowerCase()} farm` },
    { label: 'CS / min', value: core.csPerMin.toFixed(1), caption: 'minions + jungle' },
    { label: 'Gold', value: goldK(core.gold), caption: 'earned total' },
    { label: 'Gold / min', value: String(core.goldPerMin), caption: 'economy rate' },
  ]
  return (
    <Card padding={0}>
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '16px 20px', minWidth: 196 }}>
          <ChampAvatar name={core.champion} size="lg" shape="rounded" ring={core.win ? 'win' : 'loss'} />
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ fontSize: 11, color: core.win ? 'var(--win)' : 'var(--loss)', marginBottom: 3 }}>
              {core.role} · {core.win ? 'Victory' : 'Defeat'}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 21, color: 'var(--text-primary)', lineHeight: 1.05 }}>
              {core.champion}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {formatDuration(core.durationSec)} · {queueLabel(core.queue)}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 22, padding: '16px 22px', borderLeft: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
          {stats.map((s, i) => <StatBlock key={i} size="sm" {...s} />)}
        </div>
      </div>
    </Card>
  )
}

// ── FACTUAL: lane-by-lane matchup (US2) ──────────────────────────────────────
function statLine(e: RosterEntry): string {
  return `${e.kills}/${e.deaths}/${e.assists} · ${e.cs} cs · ${goldK(e.gold)}`
}

function Matchup({ matchup }: { matchup: MatchupData }) {
  const rows = matchup.allies.map((a, i) => ({ a, e: matchup.enemies[i] as RosterEntry | undefined }))
  return (
    <Card padding={16}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 1fr', alignItems: 'center', gap: '0 12px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--data-ally)', flex: 'none' }} />
          <span className="eyebrow" style={{ fontSize: 11, color: 'var(--blue-400)' }}>Your team</span>
        </div>
        <span />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
          <span className="eyebrow" style={{ fontSize: 11, color: 'var(--red-400)' }}>Enemy</span>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--data-enemy)', flex: 'none' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(({ a, e }, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 56px 1fr', alignItems: 'center', gap: '0 12px',
            padding: '6px 8px', borderRadius: 'var(--radius-md)',
            background: a.isYou ? 'rgba(242,179,61,0.07)' : 'transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <ChampAvatar name={a.champion} size="sm" shape="rounded" ring={a.isYou ? 'accent' : 'var(--data-ally)'} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.champion}
                  {a.isYou && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--gold-400)', marginLeft: 7, letterSpacing: '0.04em' }}>YOU</span>}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{statLine(a)}</div>
              </div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textAlign: 'center' }}>
              {ROLE_ABBR[a.role] ?? a.role.toUpperCase()}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', minWidth: 0 }}>
              <div style={{ minWidth: 0, textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: e?.isLaneOpponent ? 'var(--data-enemy)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e?.isLaneOpponent && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--data-enemy)', marginRight: 7, letterSpacing: '0.04em' }}>LANE</span>}
                  {e?.champion ?? '—'}
                </div>
                {e && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{statLine(e)}</div>}
              </div>
              {e && <ChampAvatar name={e.champion} size="sm" shape="rounded" ring="var(--data-enemy)" />}
            </div>
          </div>
        ))}
      </div>
      {!matchup.laneOpponent && (
        <div style={{ marginTop: 10, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-faint)' }}>
          No fixed lane opponent this game — your role roams rather than holding a single lane.
        </div>
      )}
    </Card>
  )
}

// ── FACTUAL: the decided-by-numbers breakdown (US2) ──────────────────────────
function nr(v: number | null, fmt: (n: number) => string): string {
  return v == null ? '—' : fmt(v)
}

function Breakdown({ b }: { b: BreakdownData }) {
  const stats: { label: string; value: string; caption: string; unit?: string }[] = [
    { label: 'CS @ 10', value: nr(b.csAt10, String), caption: 'minions at 10:00' },
    { label: 'CS / min', value: b.csPerMin.toFixed(1), caption: 'full game' },
    { label: 'Gold @ 14', value: nr(b.goldAt14, goldDiffK), caption: 'vs lane opponent' },
    { label: 'Gold @ 24', value: nr(b.goldAt24, goldDiffK), caption: 'vs lane opponent' },
    { label: 'Vision', value: String(b.visionScore), caption: 'vision score' },
    { label: 'Solo deaths', value: String(b.soloDeaths), caption: 'died alone' },
    { label: 'Kill part.', value: Math.round(b.killParticipation * 100) + '%', caption: 'of team kills' },
  ]
  return (
    <Card padding={16}>
      <div className="eyebrow" style={{ fontSize: 11, marginBottom: 14 }}>Breakdown</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '18px 14px' }}>
        {stats.map((s, i) => <StatBlock key={i} size="sm" {...s} />)}
      </div>
    </Card>
  )
}

// ── FACTUAL: death map (US4) ─────────────────────────────────────────────────
function DeathMap({ dm }: { dm: DeathMapData }) {
  return (
    <Card padding={16}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>Death map</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{dm.count} {dm.count === 1 ? 'death' : 'deaths'}</span>
      </div>
      {dm.count === 0 ? (
        <div style={{ padding: '24px 8px', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>
          <Icon name="shield" size={16} style={{ color: 'var(--win)', verticalAlign: 'middle', marginRight: 8 }} />
          A deathless game — nothing to map.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14 }}>
          <div className="ck-minimap" style={{ width: 150, height: 150, flex: 'none' }}>
            <div className="ck-minimap__grid" />
            {dm.deaths.map(d => (
              <span key={d.n} className="ck-minimap__death" style={{ left: d.xPct + '%', top: d.yPct + '%', background: 'var(--loss)' }}>
                {d.n}
              </span>
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {dm.deaths.map(d => (
              <div key={d.n} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                <span className="ck-death-n" style={{ background: 'var(--loss)' }}>{d.n}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtClock(d.tMin)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>
                  death {d.n} of {dm.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// Map a factual highlight to the timeline component's event vocabulary.
function toTimelineEvents(hl: Highlight[]) {
  return hl.map(h => ({ t: h.tMin, kind: h.kind, label: h.label, detail: h.detail }))
}

function UnavailableNote({ what }: { what: string }) {
  return (
    <Card padding={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>
        <Icon name="history" size={15} style={{ color: 'var(--text-faint)', flex: 'none' }} />
        {what} isn’t available for this game — Corky doesn’t have its detailed timeline stored.
      </div>
    </Card>
  )
}

// -------------------------------------------------------------- notepad
function loadNote(key: string): string {
  try {
    const raw = localStorage.getItem(key)
    if (raw) { const v = JSON.parse(raw); return typeof v === 'string' ? v : (v.text || '') }
  } catch { /* ignore */ }
  return ''
}
function saveNote(key: string, text: string) { try { localStorage.setItem(key, JSON.stringify(text)) } catch { /* ignore */ } }

function NotePad({ storeKey, accent = 'info', placeholder }: { storeKey: string; accent?: 'info' | 'accent'; placeholder: string }) {
  const [text, setText] = useState<string>(() => loadNote(storeKey))
  const [draft, setDraft] = useState<string>(text)
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { const t = loadNote(storeKey); setText(t); setDraft(t); setEditing(false) }, [storeKey])

  const hasText = !!text.trim()
  const open = editing || !hasText

  function commit() { const t = draft.trim(); setText(t); saveNote(storeKey, t); setEditing(false) }
  function cancel() { setDraft(text); setEditing(false) }
  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() }
    else if (e.key === 'Escape' && hasText) { e.preventDefault(); cancel() }
  }
  useEffect(() => {
    if (open && ref.current) {
      ref.current.focus()
      const v = ref.current.value; ref.current.setSelectionRange(v.length, v.length)
    }
  }, [open])

  if (open) {
    return (
      <Card accent={accent} padding={16}>
        <textarea ref={ref} className="ck-field" value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} rows={4}
          placeholder={placeholder}
          style={{ fontFamily: 'var(--font-sans)', fontSize: 14.5, lineHeight: 1.6, resize: 'vertical', minHeight: 92 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
          <Button variant="primary" size="sm" onClick={commit} disabled={!draft.trim()} iconLeft={<Icon name="check" size={15} />}>Save</Button>
          {hasText && <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>⌘⏎ to save{hasText ? ' · Esc to cancel' : ''}</span>
        </div>
      </Card>
    )
  }

  return (
    <Card accent={accent} padding={16}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <p style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14.5,
          color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</p>
        <Button variant="ghost" size="sm" onClick={() => { setDraft(text); setEditing(true) }} iconLeft={<Icon name="pencil" size={14} />} style={{ flex: 'none' }}>Edit</Button>
      </div>
    </Card>
  )
}

// --------------------------------------------------------------- pin store
function loadPins(): string[] { try { return JSON.parse(localStorage.getItem('ck-pinned-games') || '[]') } catch { return [] } }
function savePins(a: string[]) { try { localStorage.setItem('ck-pinned-games', JSON.stringify(a)) } catch { /* ignore */ } }

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '80px 24px', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}

// --------------------------------------------------------------- the report
export function CoachReport({ matchId, analyzed: analyzedProp, onAnalyzed }: {
  matchId: string; analyzed: boolean; onAnalyzed: () => void
}) {
  const { report, loading, notFound, error } = useMatchReport(matchId)

  // AI analysis (mock layer — gated). Driven by the host (App) or inline buttons.
  const [localAnalyzed, setLocalAnalyzed] = useState(!!analyzedProp)
  const [analyzing, setAnalyzing] = useState(false)
  useEffect(() => { setLocalAnalyzed(!!analyzedProp); setAnalyzing(false) }, [analyzedProp, matchId])
  const analyzed = analyzedProp || localAnalyzed
  function runAnalyze() {
    if (analyzing || analyzed) return
    setAnalyzing(true)
    setTimeout(() => { setAnalyzing(false); setLocalAnalyzed(true); onAnalyzed() }, 1900)
  }

  // Pin / save the game.
  const [pinned, setPinned] = useState(() => loadPins().includes(matchId))
  useEffect(() => { setPinned(loadPins().includes(matchId)) }, [matchId])
  function togglePin() {
    const a = loadPins(); const i = a.indexOf(matchId)
    if (i >= 0) a.splice(i, 1); else a.push(matchId)
    savePins(a); setPinned(i < 0)
  }

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
  const r = core.win ? REPORT_WIN : REPORT_LOSS // mock AI layer, keyed by the real result
  const sinceWins = r.sinceLast.filter(t => t.result === 'improved' || t.result === 'held').length
  const sinceApplicable = r.sinceLast.filter(t => t.result !== 'not_applicable').length

  const PinBtn = (
    <Button variant={pinned ? 'secondary' : 'ghost'} size="sm" onClick={togglePin}
      iconLeft={<Icon name={pinned ? 'bookmark' : 'pin'} size={14} style={pinned ? { color: 'var(--gold-400)' } : undefined} />}>
      {pinned ? 'Saved' : 'Pin game'}
    </Button>
  )

  return (
    <div style={{ padding: '22px 18px 60px', maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 26 }}>
      {/* Verdict — Corky's read, gated. Card frame + W/L + identity are facts. */}
      <VerdictCard result={core.win ? 'win' : 'loss'} champion={core.champion}
        duration={formatDuration(core.durationSec)} queue={queueLabel(core.queue)}
        eyebrow={analyzed ? 'Verdict' : 'Not analysed yet'}
        tags={analyzed
          ? <><Badge intent={r.headlineTagIntent}>{r.headlineTag}</Badge><Badge intent="neutral">{r.cohort.replace('Measured against ', 'vs ').replace('.', '')}</Badge>{PinBtn}</>
          : <><Button variant="primary" size="sm" onClick={runAnalyze} disabled={analyzing}
                iconLeft={<Icon name={analyzing ? 'refresh-cw' : 'sparkles'} size={15} className={analyzing ? 'ck-spin' : ''} />}>
                {analyzing ? 'Analysing…' : 'Analyze this match'}
              </Button>{PinBtn}</>}>
        {analyzed
          ? <>{r.verdict.lead} <em>{r.verdict.gild}</em></>
          : <span style={{ color: 'var(--text-faint)' }}>
              <span className="ck-inline-dots" style={{ fontSize: 22 }}>· · · · ·</span>
              <span style={{ display: 'block', marginTop: 8, fontSize: 16, color: 'var(--text-muted)', fontWeight: 500 }}>
                Run analysis to see why this game went the way it did. Your scoreline, matchup, gold timeline and death map are ready below.
              </span>
            </span>}
      </VerdictCard>

      {/* Scoreline — facts */}
      <section>
        <SectionLabel icon="bar-chart-3">This game</SectionLabel>
        <Scoreline core={core} />
      </section>

      {/* Matchup — facts */}
      <section>
        <SectionLabel icon="swords">Matchup</SectionLabel>
        <Matchup matchup={report.matchup} />
      </section>

      {/* Your reflections — raw note, always available */}
      <section>
        <SectionLabel icon="pen-line">Your reflections</SectionLabel>
        <NotePad storeKey={'ck-reflections-' + matchId}
          placeholder="How did that game feel? Raw thoughts — what you did well, what frustrated you, what you noticed…" />
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
            />
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}><UnavailableNote what="The game timeline" /></div>
        )}
        <div style={{ marginBottom: 14 }}>
          <Breakdown b={report.breakdown} />
        </div>
        {report.deathMap
          ? <DeathMap dm={report.deathMap} />
          : <UnavailableNote what="The death map" />}
      </section>

      {/* Turning points — AI read, gated */}
      <section>
        <SectionLabel icon="map" count={analyzed ? `${r.turningPoints.length} moments` : undefined}>Turning points</SectionLabel>
        {analyzed
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {r.turningPoints.map((t, i) => <TurningPoint key={i} time={t.time} swing={t.swing} swingDir={t.dir} you={t.you} event={t.event} objective={t.objective} what={t.what} better={t.better} />)}
            </div>
          : <GatedBlock title="The moments that decided the game" hint="Corky pinpoints each swing on the map and shows the better play." analyzing={analyzing} onAnalyze={runAnalyze} />}
      </section>

      {/* Next-game focus — AI read, gated */}
      <section>
        <SectionLabel icon="crosshair">Next-game focus</SectionLabel>
        {analyzed
          ? <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {r.nextFocus.map((t, i) => <FocusTask key={i} {...t} />)}
              </div>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-faint)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Icon name="sparkles" size={13} style={{ color: 'var(--gold-400)' }} />
                Corky will check these automatically after your next game.
              </p>
            </>
          : <GatedBlock title="Focus tasks for your next game" hint="Analysis turns this game’s mistakes into a short, checkable to-do list." analyzing={analyzing} onAnalyze={runAnalyze} />}
      </section>

      {/* Since last game — AI read, gated */}
      <section>
        <SectionLabel icon="history">Since last game</SectionLabel>
        {analyzed
          ? <Card padding={16}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)' }}>
                  You held <strong style={{ color: 'var(--text-primary)' }}>{sinceWins} of {sinceApplicable}</strong> focus tasks from last game.
                </span>
                <Badge intent={sinceWins >= sinceApplicable ? 'win' : 'warn'} style={{ marginLeft: 'auto' }}>{sinceWins >= sinceApplicable ? 'On track' : 'Slipped one'}</Badge>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {r.sinceLast.map((t, i) => <FocusTask key={i} {...t} />)}
              </div>
            </Card>
          : <GatedBlock title="How you did on last game’s focus tasks" hint="Analysis checks this game against the tasks Corky set you last time." analyzing={analyzing} onAnalyze={runAnalyze} />}
      </section>

      {/* Reflect on the analysis — only appears once Corky's read is in */}
      {analyzed && (
        <section>
          <SectionLabel icon="sparkles">Reflect on Corky’s read</SectionLabel>
          <NotePad storeKey={'ck-postreflect-' + matchId} accent="accent"
            placeholder="Now you’ve seen Corky’s read — what do you make of it? Agree, disagree, what you’ll change…" />
        </section>
      )}
    </div>
  )
}
