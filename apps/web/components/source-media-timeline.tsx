'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text } from '@msqdx/ui'
import { formatClock } from '@/lib/editor-time'
import {
  buildTimelineTicks,
  timelineContentWidthPx,
  timelineLeftPx,
  timelineMsPerPixel,
  timelineWidthPx,
} from '@/lib/timeline-layout'
import { useJogShuttle } from '@/lib/use-jog-shuttle'

type SourceScene = {
  sceneKey: string
  startMs: number
  endMs: number
  summary: string
}

type SourceTranscriptSegment = {
  startMs: number
  endMs: number
  text: string
}

type SourceMediaTimelineProps = {
  durationMs: number
  playheadMs: number
  scenes: SourceScene[]
  transcriptSegments?: SourceTranscriptSegment[]
  peaks: number[]
  activeSceneKey?: string | null
  markInMs?: number | null
  markOutMs?: number | null
  disabled?: boolean
  onSeek: (ms: number) => void
}

const ZOOM_LEVELS = [1, 2, 4, 8] as const

export function SourceMediaTimeline({
  durationMs,
  playheadMs,
  scenes,
  transcriptSegments = [],
  peaks,
  activeSceneKey,
  markInMs = null,
  markOutMs = null,
  disabled = false,
  onSeek,
}: SourceMediaTimelineProps) {
  const lanesRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [zoomIndex, setZoomIndex] = useState(0)

  const zoomLevel = ZOOM_LEVELS[zoomIndex] ?? 1
  const msPerPixel = timelineMsPerPixel(zoomLevel)
  const contentWidthPx = timelineContentWidthPx(durationMs, zoomLevel)
  const ticks = useMemo(() => buildTimelineTicks(durationMs, zoomLevel), [durationMs, zoomLevel])

  const seekFromPointer = useCallback(
    (clientX: number) => {
      if (!lanesRef.current || durationMs <= 0) return
      const rect = lanesRef.current.getBoundingClientRect()
      const x = Math.min(Math.max(clientX - rect.left, 0), contentWidthPx)
      onSeek(Math.floor(x * msPerPixel))
    },
    [contentWidthPx, durationMs, msPerPixel, onSeek],
  )

  useJogShuttle(viewportRef, (deltaMs) => onSeek(playheadMs + deltaMs), { enabled: !disabled })

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
    context.fillStyle = '#2d6a9f'
    const mid = height / 2
    const bucketMs = durationMs / peaks.length
    for (const [index, peak] of peaks.entries()) {
      const bucketStart = index * bucketMs
      const left = timelineLeftPx(bucketStart, msPerPixel)
      const right = timelineLeftPx(bucketStart + bucketMs, msPerPixel)
      const barHeight = Math.max(peak * (height - 4), 1)
      context.fillRect(left, mid - barHeight / 2, Math.max(right - left, 1), barHeight)
    }
  }, [durationMs, msPerPixel, peaks])

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    seekFromPointer(event.clientX)
  }

  const startPlayheadDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (disabled) return
    const onMove = (moveEvent: PointerEvent) => seekFromPointer(moveEvent.clientX)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    seekFromPointer(event.clientX)
  }

  const playheadLeftPx = timelineLeftPx(playheadMs, msPerPixel)

  return (
    <div className="videon-cut-timeline videon-cut-timeline--source">
      <div className="videon-cut-timeline__meta">
        <span className="videon-cut-timeline__title">Quell-Timeline</span>
        <Text role="meta">
          {formatClock(playheadMs)} / {formatClock(durationMs)}
        </Text>
        <div className="videon-cut-timeline__zoom">
          <button
            type="button"
            className="videon-nle__tool-btn"
            disabled={zoomIndex <= 0}
            onClick={() => setZoomIndex((current) => Math.max(current - 1, 0))}
            aria-label="Zoom out"
          >
            −
          </button>
          <Text role="meta">{zoomLevel}×</Text>
          <button
            type="button"
            className="videon-nle__tool-btn"
            disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
            onClick={() => setZoomIndex((current) => Math.min(current + 1, ZOOM_LEVELS.length - 1))}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div className="videon-cut-timeline__viewport" ref={viewportRef}>
        <div className="videon-cut-timeline__layout">
          <div className="videon-cut-timeline__headers" aria-hidden="true">
            <div className="videon-cut-timeline__header-spacer" />
            <div className="videon-cut-timeline__header-label">V1</div>
            <div className="videon-cut-timeline__header-label videon-cut-timeline__header-label--audio">A1</div>
            <div className="videon-cut-timeline__header-label videon-cut-timeline__header-label--transcript">TX</div>
          </div>
          <div className="videon-cut-timeline__lanes-wrap">
            <div className="videon-cut-timeline__lanes" style={{ width: `${contentWidthPx}px` }} ref={lanesRef}>
              <div className="videon-cut-timeline__grid" aria-hidden="true">
                {ticks.map((tick) => (
                  <div
                    key={tick.ms}
                    className={`videon-cut-timeline__grid-line${tick.major ? ' is-major' : ''}`}
                    style={{ left: `${tick.leftPx}px` }}
                  />
                ))}
              </div>

              <div className="videon-cut-timeline__ruler" onPointerDown={onTrackPointerDown}>
                {ticks.map((tick) => (
                  <div
                    key={`label-${tick.ms}`}
                    className={`videon-cut-timeline__ruler-tick${tick.major ? ' is-major' : ''}`}
                    style={{ left: `${tick.leftPx}px` }}
                  >
                    {tick.label ? <span>{tick.label}</span> : null}
                  </div>
                ))}
              </div>

              <div
                className="videon-cut-timeline__track videon-cut-timeline__track--video"
                onPointerDown={onTrackPointerDown}
              >
                {markInMs !== null && markOutMs !== null && markOutMs > markInMs ? (
                  <div
                    className="videon-editor__range-marker"
                    style={{
                      left: `${timelineLeftPx(markInMs, msPerPixel)}px`,
                      width: `${timelineWidthPx(markOutMs - markInMs, msPerPixel)}px`,
                    }}
                  />
                ) : null}
                {scenes.map((scene) => (
                  <button
                    key={scene.sceneKey}
                    type="button"
                    className={`videon-cut-timeline__clip videon-cut-timeline__clip--scene${activeSceneKey === scene.sceneKey ? ' is-active' : ''}`}
                    style={{
                      left: `${timelineLeftPx(scene.startMs, msPerPixel)}px`,
                      width: `${timelineWidthPx(scene.endMs - scene.startMs, msPerPixel)}px`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSeek(scene.startMs)
                    }}
                    title={scene.summary}
                  >
                    <span className="videon-cut-timeline__clip-label">{scene.summary}</span>
                  </button>
                ))}
              </div>

              <div className="videon-cut-timeline__track videon-cut-timeline__track--audio">
                <canvas ref={canvasRef} className="videon-cut-timeline__audio-canvas" aria-label="Audio-Spur A1" />
              </div>

              <div className="videon-cut-timeline__track videon-cut-timeline__track--transcript">
                {transcriptSegments.map((segment, index) => (
                  <button
                    key={`${segment.startMs}-${index}`}
                    type="button"
                    className="videon-cut-timeline__transcript-segment"
                    style={{
                      left: `${timelineLeftPx(segment.startMs, msPerPixel)}px`,
                      width: `${timelineWidthPx(segment.endMs - segment.startMs, msPerPixel)}px`,
                    }}
                    title={segment.text}
                    onClick={() => onSeek(segment.startMs)}
                  >
                    {segment.text}
                  </button>
                ))}
              </div>

              <div
                className="videon-cut-timeline__playhead"
                style={{ left: `${playheadLeftPx}px` }}
                onPointerDown={startPlayheadDrag}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
