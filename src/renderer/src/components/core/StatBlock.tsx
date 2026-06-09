import React from 'react'

interface StatBlockProps {
  label?: string
  value: string | number
  unit?: string
  delta?: string | number
  deltaDir?: 'up' | 'down' | 'flat'
  caption?: string
  size?: 'sm' | 'md' | 'lg'
  valueColor?: string
  className?: string
}

export function StatBlock({
  label, value, unit, delta, deltaDir, caption, size = 'md', valueColor, className = '',
}: StatBlockProps) {
  const dir = deltaDir || (typeof delta === 'string' && delta.trim().startsWith('-') ? 'down'
    : typeof delta === 'string' && delta.trim().startsWith('+') ? 'up' : 'flat')
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—'
  const cls = ['ck-stat', `ck-stat--${size}`, className].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      {label && <span className="ck-stat__label">{label}</span>}
      <div className="ck-stat__value-row">
        <span className="ck-stat__value" style={valueColor ? { color: valueColor } : undefined}>
          {value}{unit && <span className="ck-stat__unit"> {unit}</span>}
        </span>
        {delta != null && (
          <span className={`ck-stat__delta ck-stat__delta--${dir}`}>
            <span style={{ fontSize: '0.7em' }}>{arrow}</span>{delta}
          </span>
        )}
      </div>
      {caption && <span className="ck-stat__caption">{caption}</span>}
    </div>
  )
}
