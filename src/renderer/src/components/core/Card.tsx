import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  eyebrow?: string
  action?: React.ReactNode
  accent?: 'win' | 'loss' | 'accent' | 'objective' | 'info'
  interactive?: boolean
  flush?: boolean
  padding?: number | string
}

export function Card({
  children,
  title,
  eyebrow,
  action,
  accent,
  interactive = false,
  flush = false,
  padding,
  className = '',
  style,
  ...rest
}: CardProps) {
  const cls = ['ck-card', interactive ? 'ck-card--interactive' : '', flush ? 'ck-card--flush' : '', className]
    .filter(Boolean).join(' ')
  const padStyle = padding != null ? { '--pad': typeof padding === 'number' ? padding + 'px' : padding } as React.CSSProperties : undefined
  return (
    <div className={cls} style={{ ...padStyle, ...style }} {...rest}>
      {accent && <div className={`ck-card__bar ck-card__bar--${accent}`} />}
      {(title || eyebrow || action) && (
        <div className="ck-card__header">
          <div>
            {eyebrow && <div className="ck-card__eyebrow">{eyebrow}</div>}
            {title && <h3 className="ck-card__title">{title}</h3>}
          </div>
          {action}
        </div>
      )}
      <div className="ck-card__body">{children}</div>
    </div>
  )
}
