import React from 'react'

interface VerdictCardProps {
  result?: 'win' | 'loss'
  champion?: string
  duration?: string
  queue?: string
  eyebrow?: string
  children?: React.ReactNode
  tags?: React.ReactNode
  className?: string
}

export function VerdictCard({
  result = 'loss',
  champion,
  duration,
  queue,
  eyebrow = 'Verdict',
  children,
  tags,
  className = '',
}: VerdictCardProps) {
  const win = result === 'win'
  const glow = win ? 'rgba(33,208,163,0.16)' : 'rgba(255,87,101,0.16)'
  const cls = ['ck-verdict', className].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <div className="ck-verdict__accentglow" style={{ '--_glow': glow } as React.CSSProperties} />
      <div className="ck-verdict__inner">
        <div className="ck-verdict__result">
          <span className={`ck-verdict__wl ck-verdict__wl--${win ? 'win' : 'loss'}`}>{win ? 'Win' : 'Loss'}</span>
          {champion && <span className="ck-verdict__meta">{champion}</span>}
          {(duration || queue) && <span className="ck-verdict__meta">{[queue, duration].filter(Boolean).join(' · ')}</span>}
        </div>
        <div className="ck-verdict__body">
          <div className="ck-verdict__eyebrow">{eyebrow}</div>
          <div className="ck-verdict__text">{children}</div>
          {tags && <div className="ck-verdict__tags">{tags}</div>}
        </div>
      </div>
    </div>
  )
}
