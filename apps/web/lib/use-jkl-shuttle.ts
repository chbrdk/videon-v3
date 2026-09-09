'use client'

import { useEffect, useRef, useState } from 'react'

const RATES = [2, 4, 8] as const

/**
 * Hold J/L to escalate shuttle rate; release or K (via stop) clears.
 * Returns current rate in frames-per-tick sign (±2/4/8) or 0.
 */
export function useJklShuttle(
  onTick: (deltaMs: number) => void,
  options: { enabled?: boolean; frameMs?: number } = {},
): { rate: number; stop: () => void; hold: (direction: -1 | 1, holding: boolean) => void } {
  const { enabled = true, frameMs = 40 } = options
  const [rate, setRate] = useState(0)
  const rateRef = useRef(0)
  const dirRef = useRef<-1 | 1 | 0>(0)
  const holdStartedRef = useRef(0)
  const levelRef = useRef(0)
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  const stop = () => {
    rateRef.current = 0
    dirRef.current = 0
    levelRef.current = 0
    setRate(0)
  }

  const hold = (direction: -1 | 1, holding: boolean) => {
    if (!enabled) return
    if (!holding) {
      if (dirRef.current === direction) stop()
      return
    }
    const now = performance.now()
    if (dirRef.current !== direction) {
      dirRef.current = direction
      holdStartedRef.current = now
      levelRef.current = 0
    } else {
      const held = now - holdStartedRef.current
      levelRef.current = held > 1800 ? 2 : held > 700 ? 1 : 0
    }
    const next = direction * RATES[levelRef.current]!
    rateRef.current = next
    setRate(next)
  }

  useEffect(() => {
    if (!enabled || rate === 0) return
    const id = window.setInterval(() => {
      onTickRef.current(rateRef.current * frameMs)
    }, 40)
    return () => window.clearInterval(id)
  }, [enabled, frameMs, rate])

  return { rate, stop, hold }
}
