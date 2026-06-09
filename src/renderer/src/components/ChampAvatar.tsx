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

  useEffect(() => {
    if (src) return
    ensureDDLoaded().then(() => {
      const url = champImgUrl(name)
      if (url) setSrc(url)
    })
  }, [name, src])

  return <Avatar src={src} name={name} {...rest} />
}
