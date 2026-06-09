import React from 'react'

interface ToggleProps {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
}

export function Toggle({ checked, defaultChecked, onChange, label, disabled = false, className = '' }: ToggleProps) {
  const cls = ['ck-toggle', className].filter(Boolean).join(' ')
  return (
    <label className={cls} data-disabled={disabled}>
      <input
        type="checkbox"
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={e => onChange && onChange(e.target.checked)}
      />
      <span className="ck-toggle__track"><span className="ck-toggle__knob" /></span>
      {label && <span className="ck-toggle__label">{label}</span>}
    </label>
  )
}
