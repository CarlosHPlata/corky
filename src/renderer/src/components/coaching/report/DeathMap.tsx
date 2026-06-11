import React, { useEffect, useState } from 'react'
import { Card } from '../../core/Card'
import { Icon } from '../../Icon'
import { AskBadge, type AddRef } from '../AskRef'
import { DEATH_CHARACTER, deathNarrationByN, deathRef, fmtClock } from './format'
import type { DeathMap as DeathMapData, DeathNarration } from '@shared/types'

// ── FACTUAL death map (US4) + per-death narration (pass 2) ───────────────────
// The map positions are facts; the narration ("caught out", "why it mattered")
// is Corky's read. Click a death to read its note — the narration is keyed by
// `marker:death#n`, the same n the map plots.
export function DeathMap({ dm, narrations, onActiveDeath, onAsk }: {
  dm: DeathMapData; narrations?: DeathNarration[]; onActiveDeath?: (tMin: number | null) => void; onAsk?: AddRef
}) {
  const byN = deathNarrationByN(narrations)
  const hasNarr = byN.size > 0
  const [sel, setSel] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => { setSel(null); setHover(null) }, [dm])

  // The death currently in focus (hover wins over click). Pushed up so the
  // timeline can mark the same moment.
  const activeN = hover ?? sel
  useEffect(() => {
    const d = activeN != null ? dm.deaths.find(x => x.n === activeN) : undefined
    onActiveDeath?.(d ? d.tMin : null)
  }, [activeN, dm, onActiveDeath])

  const selected = sel != null ? byN.get(sel) : undefined

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
        <>
          <div style={{ display: 'flex', gap: 14 }}>
            <div className="ck-minimap" style={{ width: 150, height: 150, flex: 'none' }}>
              <div className="ck-minimap__grid" />
              {dm.deaths.map(d => (
                <span key={d.n} className="ck-minimap__death"
                  onClick={hasNarr ? () => setSel(d.n) : undefined}
                  onMouseEnter={() => setHover(d.n)} onMouseLeave={() => setHover(h => (h === d.n ? null : h))}
                  onContextMenu={onAsk ? (e) => { e.preventDefault(); onAsk(deathRef(d.n)) } : undefined}
                  title={onAsk ? 'Right-click to ask Corky about this death' : undefined}
                  style={{ left: d.xPct + '%', top: d.yPct + '%', background: 'var(--loss)', cursor: 'pointer', outline: activeN === d.n ? '2px solid var(--gold-400)' : 'none' }}>
                  {d.n}
                </span>
              ))}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {dm.deaths.map(d => {
                const narr = byN.get(d.n)
                const isActive = activeN === d.n
                const hoverProps = {
                  onMouseEnter: () => setHover(d.n),
                  onMouseLeave: () => setHover(h => (h === d.n ? null : h)),
                  onContextMenu: onAsk
                    ? (e: React.MouseEvent) => { e.preventDefault(); onAsk(deathRef(d.n)) }
                    : undefined,
                }
                const row = (
                  <>
                    <span className="ck-death-n" style={{ background: 'var(--loss)' }}>{d.n}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtClock(d.tMin)}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: narr ? DEATH_CHARACTER[narr.character].tone : 'var(--text-faint)' }}>
                      {narr ? DEATH_CHARACTER[narr.character].label : `death ${d.n} of ${dm.count}`}
                    </span>
                    {onAsk && (
                      <AskBadge evidence={deathRef(d.n)} onAsk={onAsk} visible={isActive}
                        style={{ marginLeft: 'auto' }} />
                    )}
                  </>
                )
                return narr ? (
                  <button key={d.n} onClick={() => setSel(sel === d.n ? null : d.n)} {...hoverProps}
                    style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '4px 6px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: isActive ? 'rgba(242,179,61,0.10)' : 'transparent' }}>
                    {row}
                  </button>
                ) : (
                  <div key={d.n} {...hoverProps}
                    style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '4px 6px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      background: isActive ? 'rgba(242,179,61,0.10)' : 'transparent' }}>
                    {row}
                  </div>
                )
              })}
            </div>
          </div>
          {hasNarr && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2, rgba(255,255,255,0.03))', borderLeft: '2px solid var(--gold-400)' }}>
              {selected ? (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: DEATH_CHARACTER[selected.character].tone }}>{DEATH_CHARACTER[selected.character].label}</strong> — {selected.text}
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-faint)' }}>
                  <Icon name="sparkles" size={13} style={{ color: 'var(--gold-400)', verticalAlign: 'middle', marginRight: 6 }} />
                  Click a death to read Corky’s note on it.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
