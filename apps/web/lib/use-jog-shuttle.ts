'use client'

import { useEffect, type RefObject } from 'react'

type JogShuttleOptions = {
  enabled?: boolean
  frameMs?: number
  coarseMs?: number
}

export function useJogShuttle(
  ref: RefObject<HTMLElement | null>,
  onSeekDelta: (deltaMs: number) => void,
  options: JogShuttleOptions = {},
): void {
  const { enabled = true, frameMs = 40, coarseMs = 1000 } = options

  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const magnitude = Math.min(Math.abs(event.deltaY), 120)
      const steps = Math.max(1, Math.round(magnitude / 40))
      const unit = event.shiftKey ? coarseMs : frameMs
      const direction = event.deltaY > 0 ? 1 : -1
      onSeekDelta(direction * unit * steps)
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [coarseMs, enabled, frameMs, onSeekDelta, ref])
}
