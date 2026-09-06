'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text } from '@msqdx/ui'
import { TimelineClipThumbnail } from '@/components/timeline-clip-thumbnail'
import { formatClock } from '@/lib/editor-time'
import {
  buildTimelineTicks,
  defaultTimelineZoomIndex,
  TIMELINE_ZOOM_LEVELS,
  timelineContentWidthPx,
  timelineLeftPx,
  timelineMsPerPixel,
  timelineWidthPx,
} from '@/lib/timeline-layout'
import { useJogShuttle } from '@/lib/use-jog-shuttle'
import { activeTranscriptIndex, usePlayheadFollow } from '@/lib/use-playhead-follow'

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
  playbackUrl?: string | null
  scenes: SourceScene[]
  transcriptSegments?: SourceTranscriptSegment[]
  peaks: number[]
  voicePeaks?: number[]
  musicPeaks?: number[]
  activeSceneKey?: string | null
  markInMs?: number | null
  markOutMs?: number | null
  disabled?: boolean
  onSeek: (ms: number) => void
}

function paintSourcePeaks(
  canvas: HTMLCanvasElement | null,
  peaks: number[],
  durationMs: number,
  msPerPixel: number,
  color: string,
) {
  if (!canvas || peaks.length === 0 || durationMs <= 0) return
  const context = canvas.getContext('2d')
  if (!context) return
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (width <= 0 || height <= 0) return
  canvas.width = width * window.devicePixelRatio
  canvas.height = height * window.devicePixelRatio
  context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0)
  context.clearRect(0, 0, width, height)
  context.fillStyle = color
  const mid = height / 2
  const bucketMs = durationMs / peaks.length
  for (const [index, peak] of peaks.entries()) {
    const bucketStart = index * bucketMs
    const left = timelineLeftPx(bucketStart, msPerPixel)
    const right = timelineLeftPx(bucketStart + bucketMs, msPerPixel)
    const barHeight = Math.max(peak * (height - 4), 1)
    context.fillRect(left, mid - barHeight / 2, Math.max(right - left, 1), barHeight)
  }
}

export function SourceMediaTimeline({
  durationMs,
  playheadMs,
  playbackUrl = null,
  scenes,
  transcriptSegments = [],
  peaks,
  voicePeaks,
  musicPeaks,
  activeSceneKey,
  markInMs = null,
  markOutMs = null,
  disabled = false,
  onSeek,
}: SourceMediaTimelineProps) {
  const lanesRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const voiceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const musicCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [zoomIndex, setZoomIndex] = useState(defaultTimelineZoomIndex)

  const zoomLevel = TIMELINE_ZOOM_LEVELS[zoomIndex] ?? 1
  const msPerPixel = timelineMsPerPixel(zoomLevel)
  const contentWidthPx = timelineContentWidthPx(durationMs, zoomLevel)
  const ticks = useMemo(() => buildTimelineTicks(durationMs, zoomLevel), [durationMs, zoomLevel])
  const resolvedVoicePeaks = voicePeaks?.length ? voicePeaks : peaks
  const resolvedMusicPeaks = musicPeaks ?? []

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

  const playheadLeftPx = timelineLeftPx(playheadMs, msPerPixel)
  usePlayheadFollow(viewportRef, playheadLeftPx, !disabled)
  const activeTxIndex = useMemo(
    () => activeTranscriptIndex(playheadMs, transcriptSegments),
    [playheadMs, transcriptSegments],
  )

  useEffect(() => {
    paintSourcePeaks(voiceCanvasRef.current, resolvedVoicePeaks, durationMs, msPerPixel, '#2d6a9f')
  }, [durationMs, msPerPixel, resolvedVoicePeaks])

  useEffect(() => {
    paintSourcePeaks(musicCanvasRef.current, resolvedMusicPeaks, durationMs, msPerPixel, '#8a6a2d')
  }, [durationMs, msPerPixel, resolvedMusicPeaks])

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
            disabled={zoomIndex >= TIMELINE_ZOOM_LEVELS.length - 1}
            onClick={() => setZoomIndex((current) => Math.min(current + 1, TIMELINE_ZOOM_LEVELS.length - 1))}
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
            <div className="videon-cut-timeline__header-label videon-cut-timeline__header-label--audio">A1 Voice</div>
            <div className="videon-cut-timeline__header-label videon-cut-timeline__header-label--audio">A2 Music</div>
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
                {markInMs !== null ? (
                  <div
                    className="videon-cut-timeline__mark videon-cut-timeline__mark--in"
                    style={{ left: `${timelineLeftPx(markInMs, msPerPixel)}px` }}
                    title={`In ${formatClock(markInMs)}`}
                  />
                ) : null}
                {markOutMs !== null ? (
                  <div
                    className="videon-cut-timeline__mark videon-cut-timeline__mark--out"
                    style={{ left: `${timelineLeftPx(markOutMs, msPerPixel)}px` }}
                    title={`Out ${formatClock(markOutMs)}`}
                  />
                ) : null}
                {scenes.map((scene) => {
                  const thumbMs = scene.startMs + Math.floor((scene.endMs - scene.startMs) / 2)
                  return (
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
                      <TimelineClipThumbnail playbackUrl={playbackUrl} sourceMs={thumbMs} />
                      <span className="videon-cut-timeline__clip-label">{scene.summary}</span>
                    </button>
                  )
                })}
              </div>

              <div className="videon-cut-timeline__track videon-cut-timeline__track--audio">
                <canvas
                  ref={voiceCanvasRef}
                  className="videon-cut-timeline__audio-canvas"
                  aria-label="Audio-Spur A1 Voice"
                />
              </div>

              <div className="videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--music">
                <canvas
                  ref={musicCanvasRef}
                  className="videon-cut-timeline__audio-canvas"
                  aria-label="Audio-Spur A2 Music"
                />
              </div>

              <div className="videon-cut-timeline__track videon-cut-timeline__track--transcript">
                {transcriptSegments.map((segment, index) => (
                  <button
                    key={`${segment.startMs}-${index}`}
                    type="button"
                    className={`videon-cut-timeline__transcript-segment${activeTxIndex === index ? ' is-active' : ''}`}
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
