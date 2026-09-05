'use client'

import { useEffect, useRef } from 'react'
import { Text } from '@msqdx/ui'

type TimelineWaveformProps = {
  peaks: number[]
  durationMs: number
  playheadMs?: number
  inMs?: number | null
  outMs?: number | null
  viewStartMs?: number
  viewEndMs?: number
  label?: string
  onSeek?: (ms: number) => void
}

export function TimelineWaveform({
  peaks,
  durationMs,
  playheadMs = 0,
  inMs = null,
  outMs = null,
  viewStartMs = 0,
  viewEndMs,
  label,
  onSeek,
}: TimelineWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const endMs = viewEndMs ?? durationMs
  const spanMs = Math.max(endMs - viewStartMs, 1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || peaks.length === 0 || durationMs <= 0) return
    const context = canvas.getContext('2d')
    if (!context) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width <= 0 || height <= 0) return
    canvas.width = width * window.devicePixelRatio
    canvas.height = height * window.devicePixelRatio
    context.scale(window.devicePixelRatio, window.devicePixelRatio)
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#3d7ab8'
    const mid = height / 2
    const bucketMs = durationMs / peaks.length
    for (const [index, peak] of peaks.entries()) {
      const bucketStart = index * bucketMs
      const bucketEnd = bucketStart + bucketMs
      if (bucketEnd < viewStartMs || bucketStart > endMs) continue
      const left = ((Math.max(bucketStart, viewStartMs) - viewStartMs) / spanMs) * width
      const right = ((Math.min(bucketEnd, endMs) - viewStartMs) / spanMs) * width
      const barHeight = Math.max(peak * (height - 4), 1)
      context.fillRect(left, mid - barHeight / 2, Math.max(right - left, 1), barHeight)
    }
    if (inMs !== null && outMs !== null && outMs > inMs) {
      const rangeLeft = ((Math.max(inMs, viewStartMs) - viewStartMs) / spanMs) * width
      const rangeRight = ((Math.min(outMs, endMs) - viewStartMs) / spanMs) * width
      context.fillStyle = 'rgba(251, 191, 36, 0.22)'
      context.fillRect(rangeLeft, 0, Math.max(rangeRight - rangeLeft, 1), height)
    }
    const playheadLeft = ((playheadMs - viewStartMs) / spanMs) * width
    if (playheadLeft >= 0 && playheadLeft <= width) {
      context.strokeStyle = '#ff6b00'
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(playheadLeft, 0)
      context.lineTo(playheadLeft, height)
      context.stroke()
    }
  }, [durationMs, endMs, inMs, outMs, peaks, playheadMs, spanMs, viewStartMs])

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onSeek || durationMs <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    onSeek(Math.floor(viewStartMs + ratio * spanMs))
  }

  if (peaks.length === 0) return null

  return (
    <div className="videon-waveform">
      {label ? <Text role="meta">{label}</Text> : null}
      <canvas
        ref={canvasRef}
        className="videon-waveform__canvas"
        onPointerDown={onPointerDown}
        aria-label={label ?? 'Waveform'}
      />
    </div>
  )
}
