import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  iconLeft,
  iconRight,
  className = '',
  ...rest
}: ButtonProps) {
  const cls = [
    'ck-btn',
    `ck-btn--${variant}`,
    `ck-btn--${size}`,
    block ? 'ck-btn--block' : '',
    className,
  ].filter(Boolean).join(' ')
  return (
    <button className={cls} {...rest}>
      {iconLeft && <span className="ck-btn__icon">{iconLeft}</span>}
      {children}
      {iconRight && <span className="ck-btn__icon">{iconRight}</span>}
    </button>
  )
}
