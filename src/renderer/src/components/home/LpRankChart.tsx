import React from 'react'
import { Card } from '../core/Card'
import { Icon } from '../Icon'
import type { LpSnapshot, SummonerProfile } from '@shared/types'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'
import { absoluteLp, rankAtAbsoluteLp, rankLabel, relativeTime } from '../../utils/format'

// LP trajectory, built from snapshots we record on each sync.
interface LpPoint {
  ts: number
  abs: number
  lp: number
  rank: string
  delta: number | null
  promoted: boolean
}

function LpTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: LpPoint }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
      padding: '9px 12px', boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
        {d.rank} · {d.lp} LP
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>
        {relativeTime(d.ts)}
        {d.delta != null && (
          <span style={{ color: d.delta >= 0 ? 'var(--win)' : 'var(--loss)', marginLeft: 7, fontWeight: 700 }}>
            {d.delta >= 0 ? '+' : '−'}{Math.abs(d.delta)} LP
          </span>
        )}
      </div>
    </div>
  )
}

export function LpRankChart({ history, rank }: { history: LpSnapshot[]; rank: SummonerProfile['soloRank'] }) {
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

  // Absolute ladder LP so promotions/demotions chart correctly (Silver I → Gold IV goes up).
  const data: LpPoint[] = history.map((p, i) => {
    const abs = absoluteLp(p)
    const prev = i > 0 ? history[i - 1] : null
    return {
      ts: p.ts,
      abs,
      lp: p.leaguePoints,
      rank: rankLabel(p),
      delta: prev ? abs - absoluteLp(prev) : null,
      promoted: !!prev && (p.tier !== prev.tier || p.division !== prev.division),
    }
  })
  const lastIdx = data.length - 1
  const minAbs = Math.min(...data.map(d => d.abs)), maxAbs = Math.max(...data.map(d => d.abs))
  const domain: [number, number] = [minAbs - 18, maxAbs + 18]

  // Division floors (multiples of 100) crossing the visible range, labelled "Gold IV" etc.
  const boundaries: number[] = []
  for (let b = Math.ceil(domain[0] / 100) * 100; b <= domain[1]; b += 100) boundaries.push(b)

  const renderDot = (props: { key?: React.Key | null; cx?: number; cy?: number; index?: number; payload?: LpPoint }) => {
    const { key, cx, cy, index, payload } = props
    if (cx == null || cy == null || !payload) return <g key={key} />
    const c = payload.delta == null ? 'var(--text-faint)' : payload.delta >= 0 ? 'var(--win)' : 'var(--loss)'
    return (
      <g key={key}>
        {index === lastIdx && <circle cx={cx} cy={cy} r="8.5" fill="none" stroke="var(--gold-500)" strokeWidth="2" />}
        <circle cx={cx} cy={cy} r="4.5" fill={c} stroke="var(--bg-card)" strokeWidth="2" />
        {payload.promoted && (
          <text x={cx} y={cy + (payload.delta != null && payload.delta < 0 ? 24 : -16)} textAnchor="middle"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, fill: 'var(--gold-400)', letterSpacing: '0.04em' } as React.CSSProperties}>
            {payload.delta != null && payload.delta < 0 ? '▼' : '▲'} {payload.rank}
          </text>
        )}
      </g>
    )
  }

  return (
    <Card padding={16}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>LP &amp; rank</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
          {rank ? `${rankLabel(rank)} · ${rank.leaguePoints} LP · ` : ''}{data.length} points
        </span>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={data} margin={{ top: 26, right: 14, bottom: 2, left: 14 }}>
          <defs>
            <linearGradient id="lpFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold-400)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--gold-400)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {boundaries.map(b => {
            const div = rankAtAbsoluteLp(b)
            return (
              <ReferenceLine key={b} y={b} stroke="var(--border-subtle)" strokeDasharray="4 4"
                label={{
                  value: rankLabel(div), position: 'insideLeft', dy: -7,
                  style: { fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--text-faint)', letterSpacing: '0.04em' },
                }} />
            )
          })}
          <XAxis dataKey="ts" tickFormatter={relativeTime} axisLine={false} tickLine={false}
            tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--text-faint)' }} />
          <YAxis dataKey="abs" domain={domain} hide />
          <Tooltip content={<LpTooltip />} cursor={{ stroke: 'var(--border-subtle)', strokeDasharray: '4 4' }} />
          <Area type="monotone" dataKey="abs" stroke="var(--gold-400)" strokeWidth={2.5}
            fill="url(#lpFill)" dot={renderDot} activeDot={{ r: 6, fill: 'var(--gold-400)', stroke: 'var(--bg-card)', strokeWidth: 2 }}
            isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}
