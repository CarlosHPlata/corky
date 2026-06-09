import React from 'react'

type RingKey = 'win' | 'loss' | 'accent' | 'info'

const RING: Record<RingKey, string> = {
  win: 'var(--win)',
  loss: 'var(--loss)',
  accent: 'var(--accent)',
  info: 'var(--info)',
}

interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  src?: string
  name?: string
  shape?: 'circle' | 'rounded'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  ring?: RingKey | string
  status?: boolean
  statusColor?: string
}

export function Avatar({
  src,
  name = '',
  shape = 'circle',
  size = 'md',
  ring,
  status,
  statusColor,
  className = '',
  style,
  ...rest
}: AvatarProps) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('')
  const cls = ['ck-avatar', `ck-avatar--${shape}`, `ck-avatar--${size}`, ring ? 'ck-avatar__ring' : '', className]
    .filter(Boolean).join(' ')
  const ringColor = ring ? (RING[ring as RingKey] ?? ring) : undefined
  const ringStyle = ring ? { '--_ring': ringColor } as React.CSSProperties : undefined
  return (
    <span className={cls} style={{ ...ringStyle, ...style }} {...rest}>
      {src ? <img src={src} alt={name} /> : (initials || '?')}
      {status && <span className="ck-avatar__badge" style={{ background: statusColor || 'var(--win)' }} />}
    </span>
  )
}
