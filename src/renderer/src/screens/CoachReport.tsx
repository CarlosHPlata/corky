import React, { useState } from 'react'
import { VerdictCard } from '../components/coaching/VerdictCard'
import { FocusTask } from '../components/coaching/FocusTask'
import { TurningPoint } from '../components/coaching/TurningPoint'
import { MatchTimeline } from '../components/coaching/MatchTimeline'
import { Badge } from '../components/core/Badge'
import { Card } from '../components/core/Card'
import { StatBlock } from '../components/core/StatBlock'
import { Button } from '../components/core/Button'
import { Avatar } from '../components/core/Avatar'
import { ChampAvatar } from '../components/ChampAvatar'
import { Icon } from '../components/Icon'
import {
  REPORT_LOSS, REPORT_WIN,
  type MatchMock, type ReportMock, type DeathData, type RosterPlayer,
} from '../data/mockData'

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

function GoldChart({ curve, marks, foot }: { curve: number[]; marks: number[]; foot: { t: string; color?: string }[] }) {
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
        {marks.map((idx, k) => {
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

function DeathMap({ deaths }: { deaths: DeathData[] }) {
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
              <span key={d.n} className="ck-minimap__death" style={{ left: p.x + '%', top: p.y + '%', background: DEATH_COLOR[d.type] }}>
                {d.n}
              </span>
            )
          })}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {deaths.map(d => (
            <div key={d.n} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span className="ck-death-n" style={{ background: DEATH_COLOR[d.type] }}>{d.n}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{d.min}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: DEATH_COLOR[d.type], textTransform: 'uppercase', letterSpacing: '0.06em' }}>{DEATH_LABEL[d.type]}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{d.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function AnalyzePanel({ m, onDone }: { m: MatchMock; onDone: () => void }) {
  const [running, setRunning] = useState(false)
  function run() {
    setRunning(true)
    setTimeout(onDone, 1900)
  }
  return (
    <div style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center', padding: '0 24px' }}>
      <ChampAvatar name={m.champ} size="lg" shape="rounded" ring={m.win ? 'win' : 'loss'} style={{ margin: '0 auto 16px', display: 'block' }} />
      <h2 style={{ fontSize: 26, marginBottom: 8 }}>{m.champ} · {m.win ? 'Win' : 'Loss'} · {m.dur}</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 22, lineHeight: 1.6 }}>
        This game hasn't been analysed yet. Corky will read the match timeline, compute the features, and explain
        <em style={{ color: 'var(--gold-300)', fontStyle: 'normal' }}> why</em> it went the way it did.
      </p>
      {!running
        ? <Button variant="primary" size="lg" onClick={run} iconLeft={<Icon name="sparkles" size={18} />}>Analyze this match</Button>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <Icon name="refresh-cw" size={26} className="ck-spin" style={{ color: 'var(--gold-400)' }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>Reading the timeline…</div>
          </div>
        )}
    </div>
  )
}

function ReportView({ r, m }: { r: ReportMock; m: MatchMock }) {
  const sinceWins = r.sinceLast.filter(t => t.result === 'improved' || t.result === 'held').length
  const sinceApplicable = r.sinceLast.filter(t => t.result !== 'not_applicable').length
  return (
    <div style={{ padding: '22px 18px 60px', maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 26 }}>
      <VerdictCard result={m.win ? 'win' : 'loss'} champion={m.champ} duration={m.dur} queue={m.queue}
        tags={
          <>
            <Badge intent={r.headlineTagIntent}>{r.headlineTag}</Badge>
            <Badge intent="neutral">{r.cohort.replace('Measured against ', 'vs ').replace('.', '')}</Badge>
          </>
        }>
        {r.verdict.lead} <em>{r.verdict.gild}</em>
      </VerdictCard>

      <section>
        <SectionLabel icon="bar-chart-3">This game</SectionLabel>
        <Scoreline m={m} />
      </section>

      <section>
        <SectionLabel icon="swords">Matchup</SectionLabel>
        <Matchup roster={r.roster} />
      </section>

      <section>
        <SectionLabel icon="history">Since last game</SectionLabel>
        <Card padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)' }}>
              You held <strong style={{ color: 'var(--text-primary)' }}>{sinceWins} of {sinceApplicable}</strong> focus tasks from last game.
            </span>
            <Badge intent={sinceWins >= sinceApplicable ? 'win' : 'warn'} style={{ marginLeft: 'auto' }}>
              {sinceWins >= sinceApplicable ? 'On track' : 'Slipped one'}
            </Badge>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {r.sinceLast.map((t, i) => <FocusTask key={i} {...t} />)}
          </div>
        </Card>
      </section>

      <section>
        <SectionLabel icon="target">Evidence</SectionLabel>
        <div style={{ marginBottom: 14 }}>
          <MatchTimeline duration={m.dur} curve={r.teamGold} events={r.timelineEvents} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14 }}>
          <GoldChart curve={r.goldCurve} marks={r.chartMarks} foot={r.chartFoot} />
          <Card padding={16}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 14px' }}>
              {r.stats.map((s, i) => <StatBlock key={i} size="sm" label={s.label} value={s.value} unit={s.unit} delta={s.delta} deltaDir={s.dir} caption={s.caption} />)}
            </div>
          </Card>
        </div>
        <DeathMap deaths={r.deaths} />
      </section>

      <section>
        <SectionLabel icon="map" count={`${r.turningPoints.length} moments`}>Turning points</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {r.turningPoints.map((t, i) => (
            <TurningPoint key={i} time={t.time} swing={t.swing} swingDir={t.dir} you={t.you} event={t.event} objective={t.objective} what={t.what} better={t.better} />
          ))}
        </div>
      </section>

      <section>
        <SectionLabel icon="crosshair">Next-game focus</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {r.nextFocus.map((t, i) => <FocusTask key={i} {...t} />)}
        </div>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-faint)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="sparkles" size={13} style={{ color: 'var(--gold-400)' }} />
          Corky will check these automatically after your next game.
        </p>
      </section>
    </div>
  )
}

export function CoachReport({ match, analyzed, onAnalyzed }: { match: MatchMock | null; analyzed: boolean; onAnalyzed: () => void }) {
  const m = match!
  const r = m.win ? REPORT_WIN : REPORT_LOSS
  if (m.isNew && !analyzed) return <AnalyzePanel m={m} onDone={onAnalyzed} />
  return <ReportView r={r} m={m} />
}
