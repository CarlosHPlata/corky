import React, { useState, useEffect } from 'react'
import { Avatar } from './core/Avatar'
import { ensureDDLoaded, champImgUrl } from '../utils/ddragon'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'
type AvatarShape = 'circle' | 'rounded'
type RingKey = 'win' | 'loss' | 'accent' | 'info'

interface ChampAvatarProps {
  name: string
  size?: AvatarSize
  shape?: AvatarShape
  ring?: RingKey | string
  style?: React.CSSProperties
  className?: string
}

export function ChampAvatar({ name, ...rest }: ChampAvatarProps) {
  const [src, setSrc] = useState<string | undefined>(() => champImgUrl(name) ?? undefined)

  // Re-resolve whenever `name` changes — e.g. a pick-order swap reuses this same
  // avatar instance (same cell) but hands it a new champion. Keep the previous
  // src until the new one resolves so the slot doesn't flash empty mid-load.
  useEffect(() => {
    const url = champImgUrl(name)
    if (url) {
      setSrc(url)
      return
    }
    let alive = true
    ensureDDLoaded().then(() => {
      if (!alive) return
      const resolved = champImgUrl(name)
      if (resolved) setSrc(resolved)
    })
    return () => {
      alive = false
    }
  }, [name])

  return <Avatar src={src} name={name} {...rest} />
}
