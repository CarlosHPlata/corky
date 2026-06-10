import React, { useState } from 'react'
import { Icon } from '../Icon'
import type { EventKind, TimelineEvent } from '../../data/mockData'

const KIND: Record<EventKind, { c: string; bg: string; bd: string; icon: string }> = {
  teamfight: { c: 'var(--accent)',      bg: 'rgba(242,179,61,0.16)',   bd: 'rgba(242,179,61,0.55)',   icon: 'swords' },
  objective: { c: 'var(--violet-500)', bg: 'var(--objective-soft)',   bd: 'rgba(155,123,240,0.55)',  icon: 'flag' },
  death:     { c: 'var(--loss)',        bg: 'var(--loss-soft)',        bd: 'rgba(255,87,101,0.55)',   icon: 'skull' },
  spike:     { c: 'var(--info)',        bg: 'var(--info-soft)',        bd: 'rgba(76,141,255,0.55)',   icon: 'trending-up' },
  ace:       { c: 'var(--win)',         bg: 'var(--win-soft)',         bd: 'rgba(33,208,163,0.55)',   icon: 'sparkles' },
  pick:      { c: 'var(--gold-400)',    bg: 'var(--accent-soft)',      bd: 'rgba(242,179,61,0.55)',   icon: 'crosshair' },
}

interface MatchTimelineProps {
  duration: string | number
  curve: number[]
  events?: TimelineEvent[]
  title?: string
  subtitle?: string
  unit?: string
  className?: string
  /** Minutes-into-game of an externally-highlighted moment (e.g. a death hovered
   * in the death map). Draws a guide line + skull marker and activates the
   * nearest event pin so the two views stay in sync. */
  markerTime?: number | null
}

function parseMin(d: string | number): number {
  if (typeof d === 'number') return d
  const [m, s] = d.split(':').map(Number)
  return (m || 0) + (s || 0) / 60
}

function fmtPin(t: number): string {
  return `${Math.floor(t)}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`
}

export function MatchTimeline({
  duration, curve = [], events = [],
  title = 'Game timeline', subtitle, unit = 'k',
  className = '', markerTime = null,
}: MatchTimelineProps) {
  const [active, setActive] = useState<number | null>(null)
  const endMin = parseMin(duration) || (curve.length - 1)
  const n = curve.length
  const W = 1000, H = 200, TP = 16, BP = 16, PH = H - TP - BP

  const dmaxRaw = Math.max(0, ...curve)
  const dminRaw = Math.min(0, ...curve)
  const pad = Math.max(0.4, (dmaxRaw - dminRaw) * 0.12)
  const dmax = dmaxRaw + pad
  const dmin = dminRaw - pad
  const yFor = (v: number) => TP + ((dmax - v) / (dmax - dmin)) * PH
  const xFor = (i: number) => (i / (n - 1)) * W
  const zeroY = yFor(0)

  const valueAt = (t: number) => {
    const p = (t / endMin) * (n - 1)
    const i = Math.max(0, Math.min(n - 2, Math.floor(p)))
    return curve[i] + (curve[i + 1] - curve[i]) * (p - i)
  }
  const fmt = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + unit

  const linePts = curve.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ')
  const areaPath =
    `M0,${zeroY} ` +
    curve.map((v, i) => `L${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ') +
    ` L${W},${zeroY} Z`
  const peakIdx = curve.indexOf(dmaxRaw)
  const troughIdx = curve.indexOf(dminRaw)

  // External highlight (a death hovered in the death map): find the event pin
  // nearest its time, within ~0.75 min, so we can light it up alongside the guide.
  const markerInRange = markerTime != null && markerTime >= 0 && markerTime <= endMin
  let nearestIdx = -1
  if (markerInRange) {
    let best = 0.75
    events.forEach((e, i) => {
      const d = Math.abs(e.t - (markerTime as number))
      if (d <= best) { best = d; nearestIdx = i }
    })
  }
  // Hover wins; otherwise the external marker drives which pin reads as active.
  const activeIdx = active != null ? active : nearestIdx

  const ticks: number[] = []
  const step = endMin > 24 ? 5 : endMin > 12 ? 3 : 2
  for (let m = 0; m <= endMin; m += step) ticks.push(m)
  if (endMin - ticks[ticks.length - 1] > step * 0.4) ticks.push(Math.round(endMin))

  return (
    <div className={['ck-tl', className].join(' ')}>
      <div className="ck-tl__head">
        <div>
          <div className="ck-tl__title">{title}</div>
          <div className="ck-tl__sub">
            {subtitle || `Team gold advantage · 0:00–${typeof duration === 'string' ? duration : endMin + ':00'}`}
          </div>
        </div>
        <div className="ck-tl__legend">
          <span className="ck-tl__lg">
            <span className="ck-tl__lgdot" style={{ background: 'var(--win)' }} />Ahead
          </span>
          <span className="ck-tl__lg">
            <span className="ck-tl__lgdot" style={{ background: 'var(--loss)' }} />Behind
          </span>
        </div>
      </div>

      <div className="ck-tl__plot">
        <svg className="ck-tl__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <clipPath id="ck-tl-top"><rect x="0" y="0" width={W} height={zeroY} /></clipPath>
            <clipPath id="ck-tl-bot"><rect x="0" y={zeroY} width={W} height={H - zeroY} /></clipPath>
            <linearGradient id="ck-tl-teal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--teal-500)" stopOpacity="0.34" />
              <stop offset="1" stopColor="var(--teal-500)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ck-tl-coral" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--red-500)" stopOpacity="0" />
              <stop offset="1" stopColor="var(--red-500)" stopOpacity="0.34" />
            </linearGradient>
          </defs>
          {ticks.map((m, k) => (
            <line key={k} x1={(m / endMin) * W} y1="0" x2={(m / endMin) * W} y2={H}
              stroke="var(--data-grid)" strokeWidth="1" />
          ))}
          <path d={areaPath} fill="url(#ck-tl-teal)" clipPath="url(#ck-tl-top)" />
          <path d={areaPath} fill="url(#ck-tl-coral)" clipPath="url(#ck-tl-bot)" />
          <line x1="0" y1={zeroY} x2={W} y2={zeroY}
            stroke="var(--data-axis)" strokeWidth="1" strokeDasharray="3 4" />
          <polyline points={linePts} fill="none" stroke="var(--data-ahead)" strokeWidth="2.5"
            clipPath="url(#ck-tl-top)" vectorEffect="non-scaling-stroke"
            strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={linePts} fill="none" stroke="var(--data-behind)" strokeWidth="2.5"
            clipPath="url(#ck-tl-bot)" vectorEffect="non-scaling-stroke"
            strokeLinejoin="round" strokeLinecap="round" />
          {markerInRange && (
            <line x1={((markerTime as number) / endMin) * W} y1="0" x2={((markerTime as number) / endMin) * W} y2={H}
              stroke="var(--loss)" strokeWidth="1.5" strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {[{ i: peakIdx, v: dmaxRaw, c: 'var(--win)' }, { i: troughIdx, v: dminRaw, c: 'var(--loss)' }]
          .filter(p => Math.abs(p.v) > 0.3)
          .map((p, k) => (
            <span key={'pt' + k} style={{
              position: 'absolute',
              left: `${(p.i / (n - 1)) * 100}%`,
              top: `${(yFor(p.v) / H) * 100}%`,
              transform: 'translate(-50%,-130%)',
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
              color: p.c, whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>{fmt(p.v)}</span>
          ))}

        {markerInRange && (
          <span className="ck-tl__deathmark" style={{ left: `${((markerTime as number) / endMin) * 100}%` }}>
            <Icon name="skull" size={13} strokeWidth={2} />
          </span>
        )}

        {events.map((e, i) => {
          const k = KIND[e.kind] ?? KIND.teamfight
          const v = valueAt(e.t)
          return (
            <button
              key={i}
              className="ck-tl__pin"
              data-active={String(activeIdx === i)}
              style={{
                left: `${(e.t / endMin) * 100}%`,
                top: `${(yFor(v) / H) * 100}%`,
                '--_c': k.c, '--_bd': k.bd, '--_bg': k.bg,
              } as React.CSSProperties}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(a => (a === i ? null : a))}
              onFocus={() => setActive(i)}
              aria-label={`${e.label} at ${fmtPin(e.t)}`}
            >
              <Icon name={k.icon} size={14} strokeWidth={2} />
              {activeIdx === i && (
                <span className="ck-tl__tip" style={{ left: '50%' }}>
                  <span className="ck-tl__tiptime">{fmtPin(e.t)} · {fmt(v)}</span>
                  <div className="ck-tl__tiplabel" style={{ color: k.c }}>{e.label}</div>
                  {e.detail && <div className="ck-tl__tipdetail">{e.detail}</div>}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="ck-tl__axis">
        {ticks.map((m, k) => (
          <span key={k} className="ck-tl__tick" style={{ left: `${(m / endMin) * 100}%` }}>
            {m}:00
          </span>
        ))}
      </div>

      {events.length > 0 && (
        <div className="ck-tl__strip">
          {events.map((e, i) => {
            const k = KIND[e.kind] ?? KIND.teamfight
            return (
              <button
                key={i}
                className="ck-tl__chip"
                data-active={String(activeIdx === i)}
                style={{ '--_c': k.c, '--_bd': k.bd, '--_bg': k.bg } as React.CSSProperties}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(a => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
              >
                <span className="ck-tl__chipdot">
                  <Icon name={k.icon} size={13} strokeWidth={2} />
                </span>
                <span className="ck-tl__chiptime">{fmtPin(e.t)}</span>
                <span className="ck-tl__chiplabel">{e.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
