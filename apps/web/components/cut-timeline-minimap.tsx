'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'
import { minimapPointerToScrollLeft } from '@/lib/timeline-minimap-pan'

type CutTimelineMinimapProps = {
  totalDurationMs: number
  cutPlayheadMs: number
  scrollLeft: number
  viewportWidthPx: number
  contentWidthPx: number
  selection?: { startMs: number; endMs: number } | null
  onSeek: (ms: number) => void
  onPanRatio: (scrollLeft: number) => void
}

export function CutTimelineMinimap({
  totalDurationMs,
  cutPlayheadMs,
  scrollLeft,
  viewportWidthPx,
  contentWidthPx,
  selection,
  onSeek,
  onPanRatio,
}: CutTimelineMinimapProps) {
  const duration = Math.max(totalDurationMs, 1)
  const playheadPct = Math.min(100, Math.max(0, (cutPlayheadMs / duration) * 100))
  const windowLeftPct =
    contentWidthPx > 0 ? Math.min(100, Math.max(0, (scrollLeft / contentWidthPx) * 100)) : 0
  const windowWidthPct =
    contentWidthPx > 0
      ? Math.min(100 - windowLeftPct, Math.max(4, (viewportWidthPx / contentWidthPx) * 100))
      : 100

  const panFromClientX = (track: HTMLElement, clientX: number) => {
    const rect = track.getBoundingClientRect()
    onPanRatio(
      minimapPointerToScrollLeft({
        clientX,
        trackLeft: rect.left,
        trackWidth: rect.width,
        contentWidthPx,
        viewportWidthPx,
      }),
    )
  }

  const onTrackPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    const ratio = rect.width > 0 ? x / rect.width : 0
    if (event.shiftKey) {
      panFromClientX(event.currentTarget, event.clientX)
      return
    }
    onSeek(Math.floor(ratio * duration))
  }

  const onWindowPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.preventDefault()
    const track = event.currentTarget.parentElement
    if (!track) return
    panFromClientX(track, event.clientX)
    const onMove = (moveEvent: PointerEvent) => panFromClientX(track, moveEvent.clientX)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className="videon-cut-timeline__minimap"
      role="slider"
      aria-label="Timeline-Minimap"
      aria-valuemin={0}
      aria-valuemax={totalDurationMs}
      aria-valuenow={cutPlayheadMs}
      onPointerDown={onTrackPointer}
    >
      {selection ? (
        <div
          className="videon-cut-timeline__minimap-selection"
          style={{
            left: `${(selection.startMs / duration) * 100}%`,
            width: `${Math.max(0.5, ((selection.endMs - selection.startMs) / duration) * 100)}%`,
          }}
        />
      ) : null}
      <div
        className="videon-cut-timeline__minimap-window"
        style={{ left: `${windowLeftPct}%`, width: `${windowWidthPct}%` }}
        onPointerDown={onWindowPointerDown}
        title="Viewport ziehen zum Pannen"
      />
      <div className="videon-cut-timeline__minimap-playhead" style={{ left: `${playheadPct}%` }} />
    </div>
  )
}
