import React, { useState } from 'react'
import { Card } from '../components/core/Card'
import { Badge } from '../components/core/Badge'
import { Button } from '../components/core/Button'
import { Avatar } from '../components/core/Avatar'
import { ProgressBar } from '../components/core/ProgressBar'
import { EvidenceChip } from '../components/coaching/EvidenceChip'
import { FocusTask } from '../components/coaching/FocusTask'
import { ChampAvatar } from '../components/ChampAvatar'
import { Icon } from '../components/Icon'
import { MATCHES, LP_HISTORY, REPORT_LOSS, REPORT_WIN, type MatchMock } from '../data/mockData'
import type { AppData } from '../data/useAppData'
import type { MatchSummary, SummonerProfile, LpSnapshot } from '@shared/types'
import { rankLabel, relativeTime } from '../utils/format'
import { profileIconUrl } from '../utils/ddragon'

type Screen = 'home' | 'history' | 'report' | 'champ' | 'trends' | 'settings'

interface ChampStat {
  champ: string; role: string; g: number; w: number
  k: number; d: number; a: number
  wr: number; kda: string; csmin: string
}

function champPool(matches: MatchSummary[]): ChampStat[] {
  const by: Record<string, { champ: string; role: string; g: number; w: number; k: number; d: number; a: number; cs: number }> = {}
  matches.forEach(m => {
    const s = by[m.champion] || (by[m.champion] = { champ: m.champion, role: m.role, g: 0, w: 0, k: 0, d: 0, a: 0, cs: 0 })
    s.g++; if (m.win) s.w++; s.k += m.kills; s.d += m.deaths; s.a += m.assists; s.cs += m.csPerMin
  })
  return Object.values(by)
    .map(s => ({
      ...s,
      wr: Math.round((s.w / s.g) * 100),
      kda: ((s.k + s.a) / Math.max(1, s.d)).toFixed(1),
      csmin: (s.cs / s.g).toFixed(1),
    }))
    .sort((x, y) => y.g - x.g || y.wr - x.wr)
}

function wrIntent(wr: number): 'win' | 'warn' | 'loss' {
  return wr >= 60 ? 'win' : wr >= 45 ? 'warn' : 'loss'
}
function wrColor(wr: number) {
  return wr >= 60 ? 'var(--win)' : wr >= 45 ? 'var(--warn)' : 'var(--loss)'
}

function SectionLabel({ icon, children, right }: { icon?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 0 12px' }}>
      {icon && <Icon name={icon} size={16} style={{ color: 'var(--gold-400)' }} />}
      <span className="eyebrow" style={{ fontSize: 12 }}>{children}</span>
      {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
    </div>
  )
}

// ── Hero: identity + recent form pips ───────────────────────────────────────
function Hero({ profile, matches, net, onNav }: {
  profile: SummonerProfile; matches: MatchSummary[]; net: number | null; onNav: (s: Screen) => void
}) {
  const wins = matches.filter(m => m.win).length
  const form = [...matches].reverse()
  const rank = rankLabel(profile.soloRank)
  const lp = profile.soloRank?.leaguePoints
  const icon = profileIconUrl(profile.profileIconId)

  return (
    <Card padding={0}>
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '20px 22px', minWidth: 280 }}>
          <Avatar name={profile.gameName} src={icon ?? undefined} size="lg" ring="accent" />
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ fontSize: 11, marginBottom: 4 }}>Welcome back</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'var(--text-primary)', lineHeight: 1.04 }}>
              {profile.gameName}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-faint)', fontWeight: 400, marginLeft: 7 }}>#{profile.tagLine}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: 'linear-gradient(150deg, var(--gold-400), var(--gold-600))', flex: 'none' }} />
                {rank}{lp != null ? ` · ${lp} LP` : ''}
              </span>
              {net != null && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: net >= 0 ? 'var(--win)' : 'var(--loss)' }}>
                  {net >= 0 ? '+' : '−'}{Math.abs(net)} LP this session
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 11, padding: '18px 22px', borderLeft: '1px solid var(--border-subtle)', minWidth: 300 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="eyebrow" style={{ fontSize: 11 }}>Recent form</span>
            {matches.length > 0 && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--win)' }}>{wins}W</span>{' '}
                <span style={{ color: 'var(--loss)' }}>{matches.length - wins}L</span>
                <span style={{ color: 'var(--text-faint)' }}> · {Math.round((wins / matches.length) * 100)}%</span>
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => onNav('history')}
              iconRight={<Icon name="chevron-right" size={15} />} style={{ marginLeft: 'auto' }}>
              All games
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {form.length === 0 && (
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-faint)' }}>No games synced yet.</span>
            )}
            {form.map((m, i) => (
              <span key={i} title={`${m.champion} · ${m.win ? 'Win' : 'Loss'} · ${relativeTime(m.gameCreation)}`}
                style={{
                  flex: 1, height: 34, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em',
                  color: m.win ? 'var(--win)' : 'var(--loss)',
                  background: m.win ? 'var(--win-soft)' : 'var(--loss-soft)',
                  border: '1px solid ' + (m.win ? 'rgba(33,208,163,0.28)' : 'rgba(255,87,101,0.28)'),
                }}>
                {m.win ? 'W' : 'L'}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── NextFocus: last game's next-game tasks (mock — analysis layer, wired later) ──
function NextFocus({ onOpen }: { onOpen: (m: MatchMock) => void }) {
  const latest = MATCHES[0]
  const report = latest.win ? REPORT_WIN : REPORT_LOSS
  const tasks = report.nextFocus
  return (
    <Card accent="accent" padding={18}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, marginBottom: 14 }}>
        <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
          <Icon name="crosshair" size={20} style={{ color: 'var(--gold-400)' }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', lineHeight: 1.15 }}>Next-game focus</span>
            <Badge intent="accent" dot>{tasks.length} tasks</Badge>
          </div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.55, margin: '4px 0 0' }}>
            Set from your last game —{' '}
            <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{latest.champ} {latest.win ? 'win' : 'loss'}</strong>.
            {' '}Corky checks these automatically after your next game.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onOpen(latest)}
          iconRight={<Icon name="chevron-right" size={15} />} style={{ flex: 'none' }}>
          Last report
        </Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.map((t, i) => <FocusTask key={i} {...t} />)}
      </div>
    </Card>
  )
}

// ── QuickAnalysis: lightweight session read (mock — analysis layer, wired later) ──
function QuickAnalysis() {
  const [state, setState] = useState<'idle' | 'run' | 'done'>('idle')
  const net = LP_HISTORY.points[LP_HISTORY.points.length - 1].lp - LP_HISTORY.points[0].lp

  const by: Record<string, { champ: string; g: number; w: number }> = {}
  MATCHES.forEach(m => {
    const s = by[m.champ] || (by[m.champ] = { champ: m.champ, g: 0, w: 0 })
    s.g++; if (m.win) s.w++
  })
  const pool = Object.values(by).sort((a, b) => b.g - a.g)
  const mostPlayed = pool[0]
  const best = pool.filter(p => p.g >= 2).sort((a, b) => (b.w / b.g) - (a.w / a.g))[0] ?? pool[0]

  const insights = [
    {
      icon: 'sparkles', tone: 'var(--gold-400)',
      head: `${best.champ} is your most successful pick`,
      body: `${best.w} wins from ${best.g} games. ${best.g < 3 ? 'Small sample — promising, not proven yet.' : 'The pattern holds: you close on this champion.'}`,
      chip: `${best.champ.toLowerCase()}:${best.w}-${best.g - best.w}`, kind: 'data' as const,
    },
    {
      icon: 'swords', tone: 'var(--text-secondary)',
      head: `${mostPlayed.champ} is where the volume is`,
      body: `${mostPlayed.g} games, split ${mostPlayed.w}–${mostPlayed.g - mostPlayed.w}. The wins snowballed; the losses you threw a mid-game lead. Same champion, opposite outcomes.`,
      chip: `${mostPlayed.champ.toLowerCase()}:${mostPlayed.w}-${mostPlayed.g - mostPlayed.w}`, kind: 'data' as const,
    },
    {
      icon: net >= 0 ? 'trending-up' : 'trending-down', tone: net >= 0 ? 'var(--win)' : 'var(--loss)',
      head: `Net ${net >= 0 ? '+' : '−'}${Math.abs(net)} LP, but it's choppy`,
      body: `Every climb this session got walked back — the losses cluster on games you led early, then gave up a solo death in the river. Hold the leads and this is a green week.`,
      chip: 'goldDiff@24', kind: 'objective' as const,
    },
  ]

  return (
    <Card accent="accent" padding={18}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
          <Icon name="sparkles" size={20} style={{ color: 'var(--gold-400)' }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', lineHeight: 1.15 }}>Quick analysis</div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.55, margin: '4px 0 0' }}>
            A light read of your recent games — no deep dive, just the shape of the session.
          </p>
        </div>
        {state !== 'done' && (
          <Button variant="primary" size="sm" disabled={state === 'run'}
            onClick={() => { setState('run'); setTimeout(() => setState('done'), 1400) }}
            iconLeft={<Icon name={state === 'run' ? 'refresh-cw' : 'sparkles'} size={15} className={state === 'run' ? 'ck-spin' : ''} />}>
            {state === 'run' ? 'Reading…' : 'Quick analysis'}
          </Button>
        )}
      </div>

      {state === 'done' && (
        <div className="ck-fade" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 4 }}>
          {insights.map((it, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 2px',
              borderBottom: i < insights.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <Icon name={it.icon} size={17} style={{ color: it.tone, flex: 'none', marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 3 }}>{it.head}</div>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{it.body}</p>
              </div>
              <EvidenceChip kind={it.kind} style={{ flex: 'none', marginTop: 1 }}>{it.chip}</EvidenceChip>
            </div>
          ))}
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-faint)', margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="shield" size={13} style={{ color: 'var(--text-faint)' }} />
            Open any game for the full coaching report and turning points.
          </p>
        </div>
      )}
    </Card>
  )
}

// ── LP trajectory, built from snapshots we record on each sync ────────────────
function LpRankChart({ history, rank }: { history: LpSnapshot[]; rank: SummonerProfile['soloRank'] }) {
  if (history.length < 2) {
    return (
      <Card padding={20}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
            <Icon name="trending-up" size={20} style={{ color: 'var(--gold-400)' }} />
          </span>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
              LP tracking starts now
            </div>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0', lineHeight: 1.5 }}>
              Riot doesn’t expose past LP, so Corky records it each time you sync. Play ranked and your
              trajectory builds here{rank ? ` from ${rank.leaguePoints} LP.` : '.'}
            </p>
          </div>
        </div>
      </Card>
    )
  }

  const W = 720, H = 210, padX = 10, top = 24, bot = 162
  const lps = history.map(p => p.leaguePoints)
  const min = Math.min(...lps), max = Math.max(...lps)
  const span = Math.max(1, max - min)
  const n = history.length
  const yFor = (lp: number) => top + (1 - (lp - min) / span) * (bot - top)
  const xFor = (i: number) => padX + (i / (n - 1)) * (W - padX * 2)
  const node = (i: number) => ({ x: xFor(i), y: yFor(lps[i]) })
  const lastIdx = n - 1

  return (
    <Card padding={16}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>LP &amp; rank</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{rank ? rankLabel(rank) : ''} · {n} points</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 210, display: 'block', overflow: 'visible' }} preserveAspectRatio="none">
        {history.slice(1).map((p, k) => {
          const a = node(k), b = node(k + 1)
          const up = p.leaguePoints >= history[k].leaguePoints
          return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={up ? 'var(--win)' : 'var(--loss)'} strokeWidth="2.5" strokeLinecap="round" />
        })}
        {history.map((p, i) => {
          const { x, y } = node(i)
          const delta = i === 0 ? 0 : p.leaguePoints - history[i - 1].leaguePoints
          const c = i === 0 ? 'var(--text-faint)' : delta >= 0 ? 'var(--win)' : 'var(--loss)'
          const isNow = i === lastIdx
          const above = delta >= 0
          return (
            <g key={i}>
              {isNow && <circle cx={x} cy={y} r="8.5" fill="none" stroke="var(--gold-500)" strokeWidth="2" />}
              <circle cx={x} cy={y} r="5" fill={c} stroke="var(--bg-card)" strokeWidth="2" />
              {i > 0 && (
                <text x={x} y={above ? y - 12 : y + 19} textAnchor="middle"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, fill: c } as React.CSSProperties}>
                  {above ? '+' : '−'}{Math.abs(delta)}
                </text>
              )}
            </g>
          )
        })}
        <text x={xFor(lastIdx)} y={yFor(lps[lastIdx]) + 34} textAnchor="end"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, fill: 'var(--gold-400)', letterSpacing: '0.04em' } as React.CSSProperties}>
          NOW · {lps[lastIdx]} LP
        </text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, padding: `0 ${padX}px` }}>
        {history.map((p, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>
            {relativeTime(p.ts)}
          </span>
        ))}
      </div>
    </Card>
  )
}

// ── Champion pool: most-played + win rates ───────────────────────────────────
function ChampPool({ pool }: { pool: ChampStat[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(232px, 1fr))', gap: 14 }}>
      {pool.map((c, i) => (
        <Card key={i} padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13 }}>
            <ChampAvatar name={c.champ} size="md" shape="rounded" ring={wrColor(c.wr)} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.1 }}>{c.champ}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                {c.role} · {c.g} {c.g === 1 ? 'game' : 'games'}
              </div>
            </div>
            <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: wrColor(c.wr), lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{c.wr}%</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                <span style={{ color: 'var(--win)' }}>{c.w}W</span>{' '}
                <span style={{ color: 'var(--loss)' }}>{c.g - c.w}L</span>
              </div>
            </span>
          </div>
          <ProgressBar value={c.wr} intent={wrIntent(c.wr)} height={6} showValue={false} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 11, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)' }}>
            <span>{c.kda} KDA</span>
            <span>{c.csmin} CS/min</span>
          </div>
        </Card>
      ))}
    </div>
  )
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '80px 24px', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}

export function Home({ data, onOpen, onNav }: {
  data: AppData; onOpen: (m: MatchMock) => void; onNav: (s: Screen) => void
}) {
  const { profile, matches, lpHistory, loading, syncing, error, sync } = data
  const pool = champPool(matches)

  // Session LP delta: only meaningful within the same tier+division.
  let net: number | null = null
  if (lpHistory.length >= 2) {
    const first = lpHistory[0], last = lpHistory[lpHistory.length - 1]
    if (first.tier === last.tier && first.division === last.division) {
      net = last.leaguePoints - first.leaguePoints
    }
  }

  if (loading) {
    return <CenteredNote><Icon name="refresh-cw" size={18} className="ck-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />Loading your games…</CenteredNote>
  }

  if (!profile && matches.length === 0) {
    return (
      <div style={{ padding: '22px 24px 60px', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
        <Card padding={28}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
              <Icon name="crosshair" size={24} style={{ color: 'var(--gold-400)' }} />
            </span>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)' }}>Let’s pull in your games</div>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.55, margin: 0 }}>
              Corky reads your recent ranked games and current rank straight from the Riot API. Sync to get started.
            </p>
            {error && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--loss)' }}>{error}</div>}
            <Button variant="primary" size="md" onClick={sync} disabled={syncing}
              iconLeft={<Icon name="refresh-cw" size={16} className={syncing ? 'ck-spin' : ''} />}>
              {syncing ? 'Syncing…' : 'Sync my games'}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ padding: '22px 24px 60px', maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 26 }}>
      {error && (
        <Card accent="loss" padding={14}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--loss)' }}>
            <Icon name="shield" size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />
            Sync failed: {error}
          </span>
        </Card>
      )}

      {profile && (
        <section>
          <Hero profile={profile} matches={matches} net={net} onNav={onNav} />
        </section>
      )}

      <section>
        <NextFocus onOpen={onOpen} />
      </section>

      <section>
        <QuickAnalysis />
      </section>

      <section>
        <SectionLabel icon="trending-up">LP &amp; rank · this session</SectionLabel>
        <LpRankChart history={lpHistory} rank={profile?.soloRank ?? null} />
      </section>

      {pool.length > 0 && (
        <section>
          <SectionLabel
            icon="swords"
            right={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-faint)' }}>last {matches.length} games</span>}>
            Champion pool
          </SectionLabel>
          <ChampPool pool={pool} />
        </section>
      )}
    </div>
  )
}
