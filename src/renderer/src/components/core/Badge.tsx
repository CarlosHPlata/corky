import React from 'react'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  intent?: 'win' | 'loss' | 'warn' | 'info' | 'objective' | 'accent' | 'neutral'
  dot?: boolean
  solid?: boolean
}

export function Badge({ children, intent = 'neutral', dot = false, solid = false, className = '', ...rest }: BadgeProps) {
  const cls = ['ck-badge', `ck-badge--${intent}`, solid ? 'is-solid' : '', className].filter(Boolean).join(' ')
  return (
    <span className={cls} {...rest}>
      {dot && <span className="ck-badge__dot" />}
      {children}
    </span>
  )
}
