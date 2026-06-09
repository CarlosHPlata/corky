import React from 'react'

interface Pos { x: number; y: number }

interface TurningPointProps {
  time?: string
  swing?: string
  swingDir?: 'up' | 'down'
  what?: string
  better?: string
  you?: Pos
  event?: Pos
  objective?: Pos
  className?: string
}

export function TurningPoint({
  time, swing, swingDir = 'down', what, better, you, event, objective, className = '',
}: TurningPointProps) {
  const cls = ['ck-tp', className].filter(Boolean).join(' ')
  const pos = (p?: Pos): React.CSSProperties | undefined =>
    p ? { left: p.x + '%', top: p.y + '%' } : undefined
  return (
    <div className={cls}>
      <div className="ck-tp__map">
        <div className="ck-tp__grid" />
        {objective && <span className="ck-tp__marker ck-tp__marker--obj" style={pos(objective)} />}
        {event && <span className="ck-tp__marker ck-tp__marker--event" style={pos(event)} />}
        {you && <span className="ck-tp__marker ck-tp__marker--you" style={pos(you)} />}
      </div>
      <div className="ck-tp__body">
        <div className="ck-tp__head">
          {time && <span className="ck-tp__time">{time}</span>}
          {swing && <span className={`ck-tp__swing ck-tp__swing--${swingDir}`}>{swing}</span>}
        </div>
        {what && <div className="ck-tp__what">{what}</div>}
        {better && (
          <div className="ck-tp__better">
            <span className="ck-tp__betterlabel">Better play</span>
            <span className="ck-tp__bettertext">{better}</span>
          </div>
        )}
      </div>
    </div>
  )
}
