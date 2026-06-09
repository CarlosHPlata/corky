import React from 'react'

const PIN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: '100%', height: '100%', strokeWidth: 2 }}>
    <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/>
    <circle cx="12" cy="10" r="2.5"/>
  </svg>
)

interface EvidenceChipProps {
  children?: React.ReactNode
  refId?: string
  kind?: 'data' | 'death' | 'objective'
  icon?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  /** Tooltip text shown on hover — use when the chip may truncate. */
  title?: string
  /** Truncate to a fixed width with an ellipsis (pair with `title`). */
  truncate?: boolean
  /** When provided, the chip is interactive (renders a button); otherwise it is a static label. */
  onClick?: React.MouseEventHandler
}

export function EvidenceChip({
  children, refId, kind = 'data', icon, className = '', style, title, truncate = false, onClick
}: EvidenceChipProps) {
  const interactive = !!onClick
  const cls = [
    'ck-evidence',
    kind !== 'data' ? `ck-evidence--${kind}` : '',
    interactive ? '' : 'ck-evidence--static',
    truncate ? 'ck-evidence--truncate' : '',
    className
  ].filter(Boolean).join(' ')

  // The pin icon implies a clickable location, so only show it when interactive
  // (or when a caller passes its own icon).
  const shownIcon = icon ?? (interactive ? PIN : null)
  const inner = (
    <>
      {shownIcon && <span className="ck-evidence__icon">{shownIcon}</span>}
      <span className="ck-evidence__text">{children || refId}</span>
    </>
  )

  if (interactive) {
    return (
      <button type="button" className={cls} data-ref={refId} style={style} title={title} onClick={onClick}>
        {inner}
      </button>
    )
  }
  return (
    <span className={cls} data-ref={refId} style={style} title={title}>
      {inner}
    </span>
  )
}
