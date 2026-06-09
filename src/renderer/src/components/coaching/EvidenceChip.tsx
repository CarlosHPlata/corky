import React from 'react'

const PIN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: '100%', height: '100%', strokeWidth: 2 }}>
    <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/>
    <circle cx="12" cy="10" r="2.5"/>
  </svg>
)

interface EvidenceChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  refId?: string
  kind?: 'data' | 'death' | 'objective'
  icon?: React.ReactNode
}

export function EvidenceChip({ children, refId, kind = 'data', icon, className = '', ...rest }: EvidenceChipProps) {
  const cls = ['ck-evidence', kind !== 'data' ? `ck-evidence--${kind}` : '', className].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} data-ref={refId} {...rest}>
      <span className="ck-evidence__icon">{icon || PIN}</span>
      {children || refId}
    </button>
  )
}
