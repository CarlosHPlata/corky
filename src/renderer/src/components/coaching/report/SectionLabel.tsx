import React from 'react'
import { Icon } from '../../Icon'

// The small eyebrow + icon (+ optional count) that heads each report section.
export function SectionLabel({ icon, children, count }: { icon?: string; children: React.ReactNode; count?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 0 12px' }}>
      {icon && <Icon name={icon} size={16} style={{ color: 'var(--gold-400)' }} />}
      <span className="eyebrow" style={{ fontSize: 12 }}>{children}</span>
      {count != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)' }}>{count}</span>}
    </div>
  )
}
