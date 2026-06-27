import React from 'react'
import { Card } from '../core/Card'
import { Icon } from '../Icon'

export function ReadCard({ icon, title, children, accent }: {
  icon: string; title: string; children: React.ReactNode; accent?: 'accent' | 'win' | 'loss' | 'objective'
}) {
  return (
    <Card accent={accent} padding={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <Icon name={icon} size={16} style={{ color: 'var(--gold-400)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      {children}
    </Card>
  )
}
