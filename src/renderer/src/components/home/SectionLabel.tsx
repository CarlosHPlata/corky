import React from 'react'
import { Icon } from '../Icon'

// The small eyebrow + icon that heads each home section. Supports a right-aligned
// slot (e.g. a games count) and a tunable icon tone.
export function SectionLabel({ icon, children, right, tone = 'var(--gold-400)' }: {
  icon?: string; children: React.ReactNode; right?: React.ReactNode; tone?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 0 12px' }}>
      {icon && <Icon name={icon} size={16} style={{ color: tone }} />}
      <span className="eyebrow" style={{ fontSize: 12 }}>{children}</span>
      {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
    </div>
  )
}
