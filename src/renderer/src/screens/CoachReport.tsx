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
import {
  REPORT_LOSS, REPORT_WIN,
  type MatchMock, type ReportMock, type DeathData, type RosterPlayer, type StatData,
} from '../data/mockData'

// Corky desktop — Post-game coaching report (the core surface).
//
// Two layers of content live here:
//   • FACTUAL — read straight off the match: scoreline, matchup, gold graph,
//     game timeline, death locations. These ALWAYS render, no analysis needed.
//   • CORKY'S READ — the AI-written verdict, turning points, focus tasks and
//     cohort comparisons. These stay hidden behind a "…" placeholder until the
//     player runs analysis.
// On top of that the report doubles as a notebook: per-game reflections (like
// the home session goal) plus a Pin to save the game. Both persist locally.

const ROLE_ABBR: Record<string, string> = {
  Top: 'TOP', Jungle: 'JNG', Mid: 'MID', Bot: 'BOT', Support: 'SUP',
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

// At-a-glance scoreline for this game: champ identity + the core economy line. Pure facts.
function Scoreline({ m }: { m: MatchMock }) {
  const kda = ((m.k + m.a) / Math.max(1, m.d)).toFixed(2)
  const stats = [
    { label: 'KDA', value: kda, caption: `${m.k} / ${m.d} / ${m.a}` },
    { label: 'CS', value: String(m.cs), caption: `${m.role.toLowerCase()} farm` },
    { label: 'CS / min', value: String(m.csmin), caption: 'minions + jungle' },
    ...(m.gold ? [{ label: 'Gold', value: m.gold, caption: 'earned total' }] : []),
    ...(m.goldmin ? [{ label: 'Gold / min', value: m.goldmin, caption: 'economy rate' }] : []),
  ]
  return (
    <Card padding={0}>
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '16px 20px', minWidth: 196 }}>
          <ChampAvatar name={m.champ} size="lg" shape="rounded" ring={m.win ? 'win' : 'loss'} />
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ fontSize: 11, color: m.win ? 'var(--win)' : 'var(--loss)', marginBottom: 3 }}>
              {m.role} · {m.win ? 'Victory' : 'Defeat'}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 21, color: 'var(--text-primary)', lineHeight: 1.05 }}>
              {m.champ}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {m.dur} · {m.queue}
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

// Lane-by-lane matchup — a brief of who was in the game. Pure facts.
function Matchup({ roster }: { roster: ReportMock['roster'] }) {
  const rows = roster.ally.map((a, i) => ({ a, e: roster.enemy[i] }))
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
        {rows.map(({ a, e }: { a: RosterPlayer; e: RosterPlayer }, i: number) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 56px 1fr', alignItems: 'center', gap: '0 12px',
            padding: '6px 8px', borderRadius: 'var(--radius-md)',
            background: a.you ? 'rgba(242,179,61,0.07)' : 'transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ChampAvatar name={a.champ} size="sm" shape="rounded" ring={a.you ? 'accent' : 'var(--data-ally)'} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {a.champ}
                {a.you && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--gold-400)', marginLeft: 7, letterSpacing: '0.04em' }}>YOU</span>}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textAlign: 'center' }}>
              {ROLE_ABBR[a.role] ?? a.role.toUpperCase()}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: e.lane ? 'var(--data-enemy)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>
                {e.lane && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--data-enemy)', marginRight: 7, letterSpacing: '0.04em' }}>LANE</span>}
                {e.champ}
              </span>
              <ChampAvatar name={e.champ} size="sm" shape="rounded" ring="var(--data-enemy)" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// Gold-difference curve: teal where ahead, coral where behind, split at zero. Pure facts.
// Turning-point markers (the AI read) only appear once analysed.
function GoldChart({ curve, marks, foot, analyzed }: { curve: number[]; marks: number[]; foot: { t: string; color?: string }[]; analyzed: boolean }) {
  const W = 600, H = 150, zeroY = 70, top = 14, bot = H - 14
  const max = 32
  const yFor = (v: number) => zeroY - (v / max) * (v >= 0 ? (zeroY - top) : (bot - zeroY))
  const xFor = (i: number) => (i / (curve.length - 1)) * W
  const linePts = curve.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ')
  const areaPath = `M0,${zeroY} ` + curve.map((v, i) => `L${xFor(i)},${yFor(v)}`).join(' ') + ` L${W},${zeroY} Z`
  return (
    <Card padding={16}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>Gold difference</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>vs lane opponent · 0–32 min</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 150, display: 'block', overflow: 'visible' }} preserveAspectRatio="none">
        <defs>
          <clipPath id="ck-top"><rect x="0" y="0" width={W} height={zeroY} /></clipPath>
          <clipPath id="ck-bot"><rect x="0" y={zeroY} width={W} height={H - zeroY} /></clipPath>
          <linearGradient id="ck-teal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--teal-500)" stopOpacity={0.32} />
            <stop offset="1" stopColor="var(--teal-500)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ck-coral" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--red-500)" stopOpacity={0} />
            <stop offset="1" stopColor="var(--red-500)" stopOpacity={0.32} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#ck-teal)" clipPath="url(#ck-top)" />
        <path d={areaPath} fill="url(#ck-coral)" clipPath="url(#ck-bot)" />
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--data-axis)" strokeWidth="1" strokeDasharray="3 4" />
        <polyline points={linePts} fill="none" stroke="var(--data-ally)" strokeWidth="2.5" clipPath="url(#ck-top)" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={linePts} fill="none" stroke="var(--data-enemy)" strokeWidth="2.5" clipPath="url(#ck-bot)" strokeLinecap="round" strokeLinejoin="round" />
        {/* turning-point markers — analysis only */}
        {analyzed && marks.map((idx, k) => {
          const ci = Math.round(idx)
          const c = curve[ci] >= 0 ? 'var(--win)' : 'var(--loss)'
          return (
            <g key={k}>
              <line x1={xFor(idx)} y1={top} x2={xFor(idx)} y2={bot} stroke={c} strokeWidth="1" strokeDasharray="2 3" opacity="0.55" />
              <circle cx={xFor(idx)} cy={yFor(curve[ci])} r="4" fill={c} stroke="var(--bg-card)" strokeWidth="2" />
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>
        {foot.map((f, k) => <span key={k} style={f.color ? { color: f.color } : undefined}>{f.t}</span>)}
      </div>
    </Card>
  )
}

const DEATH_COLOR: Record<DeathData['type'], string> = {
  caught_out: 'var(--loss)',
  overextended: 'var(--warn)',
  fair_fight: 'var(--text-muted)',
  outnumbered: 'var(--orange-500)',
}
const DEATH_LABEL: Record<DeathData['type'], string> = {
  caught_out: 'Caught out',
  overextended: 'Overextended',
  fair_fight: 'Fair fight',
  outnumbered: 'Outnumbered',
}

const DEATH_POS: Record<number, { x: number; y: number }> = {
  1: { x: 50, y: 48 }, 2: { x: 38, y: 70 }, 3: { x: 70, y: 64 },
}

// Death map — locations + timings are facts; the "why" (type + note) is the AI read.
function DeathMap({ deaths, analyzed, analyzing, onAnalyze }: { deaths: DeathData[]; analyzed: boolean; analyzing: boolean; onAnalyze: () => void }) {
  return (
    <Card padding={16}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>Death map</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{deaths.length} deaths</span>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <div className="ck-minimap" style={{ width: 150, height: 150, flex: 'none' }}>
          <div className="ck-minimap__grid" />
          {deaths.map(d => {
            const p = DEATH_POS[d.n] || { x: 50, y: 50 }
            return (
              <span key={d.n} className="ck-minimap__death" style={{ left: p.x + '%', top: p.y + '%', background: analyzed ? DEATH_COLOR[d.type] : 'var(--text-muted)' }}>
                {d.n}
              </span>
            )
          })}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {deaths.map(d => (
            <div key={d.n} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span className="ck-death-n" style={{ background: analyzed ? DEATH_COLOR[d.type] : 'var(--text-muted)' }}>{d.n}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{d.min}</span>
                  {analyzed
                    ? <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: DEATH_COLOR[d.type], textTransform: 'uppercase', letterSpacing: '0.06em' }}>{DEATH_LABEL[d.type]}</span>
                    : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{d.where}</span>}
                </div>
                {analyzed
                  ? <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{d.note}</div>
                  : <div className="ck-inline-dots">· · ·</div>}
              </div>
            </div>
          ))}
          {!analyzed && (
            <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-faint)' }}>Why each death happened —</span>
              <Button variant="ghost" size="sm" onClick={onAnalyze} disabled={analyzing}
                iconLeft={<Icon name={analyzing ? 'refresh-cw' : 'sparkles'} size={13} className={analyzing ? 'ck-spin' : ''} />}>
                {analyzing ? 'Analysing…' : 'Run analysis'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// -------------------------------------------------------------- notepad
// A dead-simple per-game note: one text box for raw thoughts. Type, save, and it
// becomes a read-only section with an Edit button. Persisted locally. Pure player
// input — never AI. Used twice: an always-available pre-game reflection, and a
// gold-accented one that only unlocks after analysis.
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
  const open = editing || !hasText // show the text box when editing, or when nothing's saved yet

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

// --------------------------------------------------------------- the report
export function CoachReport({ match, analyzed: analyzedProp, onAnalyzed }: { match: MatchMock | null; analyzed: boolean; onAnalyzed: () => void }) {
  const m = match!
  const r = m.win ? REPORT_WIN : REPORT_LOSS

  // Analysis can be driven by the host (App) or self-managed (inline run buttons).
  const [localAnalyzed, setLocalAnalyzed] = useState(!!analyzedProp)
  const [analyzing, setAnalyzing] = useState(false)
  useEffect(() => { setLocalAnalyzed(!!analyzedProp); setAnalyzing(false) }, [analyzedProp, m.id])
  const analyzed = analyzedProp || localAnalyzed
  function runAnalyze() {
    if (analyzing || analyzed) return
    setAnalyzing(true)
    setTimeout(() => { setAnalyzing(false); setLocalAnalyzed(true); onAnalyzed() }, 1900)
  }

  // Pin / save the game.
  const [pinned, setPinned] = useState(() => loadPins().includes(m.id))
  useEffect(() => { setPinned(loadPins().includes(m.id)) }, [m.id])
  function togglePin() {
    const a = loadPins(); const i = a.indexOf(m.id)
    if (i >= 0) a.splice(i, 1); else a.push(m.id)
    savePins(a); setPinned(i < 0)
  }
  const PinBtn = (
    <Button variant={pinned ? 'secondary' : 'ghost'} size="sm" onClick={togglePin}
      iconLeft={<Icon name={pinned ? 'bookmark' : 'pin'} size={14} style={pinned ? { color: 'var(--gold-400)' } : undefined} />}>
      {pinned ? 'Saved' : 'Pin game'}
    </Button>
  )

  const sinceWins = r.sinceLast.filter(t => t.result === 'improved' || t.result === 'held').length
  const sinceApplicable = r.sinceLast.filter(t => t.result !== 'not_applicable').length

  // Evidence stats: values are facts; deltas + cohort captions are the AI read.
  const evStat = (s: StatData) => analyzed ? { ...s, deltaDir: s.dir } : { label: s.label, value: s.value, unit: s.unit }

  return (
    <div style={{ padding: '22px 18px 60px', maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 26 }}>
      {/* Verdict — Corky's read, gated. The card frame + W/L + identity stay (facts);
          the verdict prose is hidden until analysis. Pin + analyse controls live here. */}
      <VerdictCard result={m.win ? 'win' : 'loss'} champion={m.champ} duration={m.dur} queue={m.queue}
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
                Run analysis to see why this game went the way it did. Your scoreline, matchup, gold graph, timeline and death map are ready below.
              </span>
            </span>}
      </VerdictCard>

      {/* Scoreline — this game's economy at a glance (facts) */}
      <section>
        <SectionLabel icon="bar-chart-3">This game</SectionLabel>
        <Scoreline m={m} />
      </section>

      {/* Matchup — who was in the game (facts) */}
      <section>
        <SectionLabel icon="swords">Matchup</SectionLabel>
        <Matchup roster={r.roster} />
      </section>

      {/* Your reflections — raw note, always available */}
      <section>
        <SectionLabel icon="pen-line">Your reflections</SectionLabel>
        <NotePad storeKey={'ck-reflections-' + m.id}
          placeholder="How did that game feel? Raw thoughts — what you did well, what frustrated you, what you noticed…" />
      </section>

      {/* Evidence — timeline + gold + stats + death map (facts; AI read gated inline) */}
      <section>
        <SectionLabel icon="target">Evidence</SectionLabel>
        <div style={{ marginBottom: 14 }}>
          <MatchTimeline duration={m.dur} curve={r.teamGold} events={r.timelineEvents} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14 }}>
          <GoldChart curve={r.goldCurve} marks={r.chartMarks} foot={r.chartFoot} analyzed={analyzed} />
          <Card padding={16}>
            <div className="eyebrow" style={{ fontSize: 11, marginBottom: 14 }}>{analyzed ? 'Vs your Ahri wins' : 'Measured this game'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 14px' }}>
              {r.stats.map((s, i) => <StatBlock key={i} size="sm" {...evStat(s)} />)}
            </div>
          </Card>
        </div>
        <DeathMap deaths={r.deaths} analyzed={analyzed} analyzing={analyzing} onAnalyze={runAnalyze} />
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

      {/* Since last game — AI read (measures prior focus tasks), gated */}
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
          <NotePad storeKey={'ck-postreflect-' + m.id} accent="accent"
            placeholder="Now you’ve seen Corky’s read — what do you make of it? Agree, disagree, what you’ll change…" />
        </section>
      )}
    </div>
  )
}
