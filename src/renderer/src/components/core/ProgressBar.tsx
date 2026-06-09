import React from 'react'

const COLORS: Record<string, string> = {
  accent: 'var(--accent)',
  win: 'var(--win)',
  loss: 'var(--loss)',
  info: 'var(--info)',
  warn: 'var(--warn)',
}

interface ProgressBarProps {
  value?: number
  max?: number
  target?: number
  label?: string
  valueText?: string
  intent?: 'accent' | 'win' | 'loss' | 'info' | 'warn'
  height?: number
  showValue?: boolean
  className?: string
}

export function ProgressBar({
  value = 0, max = 100, target, label, valueText, intent = 'accent', height = 8,
  showValue = true, className = '',
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const targetPct = target != null ? Math.max(0, Math.min(100, (target / max) * 100)) : null
  const cls = ['ck-progress', className].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      {(label || (showValue && valueText)) && (
        <div className="ck-progress__top">
          {label && <span className="ck-progress__label">{label}</span>}
          {showValue && <span className="ck-progress__val">{valueText ?? `${Math.round(pct)}%`}</span>}
        </div>
      )}
      <div className="ck-progress__track" style={{ '--_h': height + 'px' } as React.CSSProperties}>
        <div className="ck-progress__fill" style={{ width: pct + '%', '--_c': COLORS[intent] || intent } as React.CSSProperties} />
        {targetPct != null && <div className="ck-progress__target" style={{ left: `calc(${targetPct}% - 1px)` }} />}
      </div>
    </div>
  )
}
