'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text, TimelineRuler, ToolButton } from '@msqdx/ui'
import { TimelineClipThumbnail } from '@/components/timeline-clip-thumbnail'
import {
  DEFAULT_SOURCE_TRACK_STATE,
  TimelineTrackHeader,
  type TimelineTrackId,
  type TimelineTrackState,
} from '@/components/timeline-track-header'
import { formatClock } from '@/lib/editor-time'
import { timelineClipLabel } from '@/lib/timeline-clip-label'
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

export type SourceSceneInsight = {
  sceneKey: string
  startMs: number
  endMs: number
  summary: string
  objects?: string[]
  people?: string[]
  brandStatus?: string | null
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
  mediaLabel?: string
  scenes: SourceSceneInsight[]
  transcriptSegments?: SourceTranscriptSegment[]
  peaks: number[]
  voicePeaks?: number[]
  musicPeaks?: number[]
  activeSceneKey?: string | null
  markInMs?: number | null
  markOutMs?: number | null
  disabled?: boolean
  onSeek: (ms: number) => void
  /** V1 mute → program monitor audio. */
  onVideoMutedChange?: (muted: boolean) => void
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

function sceneInsightMeta(scene: SourceSceneInsight): string {
  const bits = [
    ...(scene.objects ?? []).slice(0, 2),
    ...(scene.people ?? []).slice(0, 1),
  ]
  if (scene.brandStatus) bits.push(`Brand:${scene.brandStatus}`)
  return bits.join(' · ')
}

export function SourceMediaTimeline({
  durationMs,
  playheadMs,
  playbackUrl = null,
  mediaLabel = 'Quelle',
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
  onVideoMutedChange,
}: SourceMediaTimelineProps) {
  const lanesRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const voiceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const musicCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [zoomIndex, setZoomIndex] = useState(defaultTimelineZoomIndex)
  const [tracks, setTracks] = useState(DEFAULT_SOURCE_TRACK_STATE)

  const zoomLevel = TIMELINE_ZOOM_LEVELS[zoomIndex] ?? 1
  const msPerPixel = timelineMsPerPixel(zoomLevel)
  const contentWidthPx = timelineContentWidthPx(durationMs, zoomLevel)
  const ticks = useMemo(() => buildTimelineTicks(durationMs, zoomLevel), [durationMs, zoomLevel])
  const resolvedVoicePeaks = voicePeaks?.length ? voicePeaks : peaks
  const resolvedMusicPeaks = musicPeaks ?? []

  const toggleTrack = useCallback((id: TimelineTrackId, field: keyof TimelineTrackState) => {
    setTracks((current) => {
      const next = {
        ...current,
        [id]: { ...current[id], [field]: !current[id][field] },
      }
      if (id === 'v1' && field === 'muted') {
        onVideoMutedChange?.(next.v1.muted)
      }
      return next
    })
  }, [onVideoMutedChange])

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
    if (tracks.a1.hidden) return
    paintSourcePeaks(voiceCanvasRef.current, resolvedVoicePeaks, durationMs, msPerPixel, '#2d6a9f')
  }, [durationMs, msPerPixel, resolvedVoicePeaks, tracks.a1.hidden])

  useEffect(() => {
    if (tracks.a2.hidden) return
    paintSourcePeaks(musicCanvasRef.current, resolvedMusicPeaks, durationMs, msPerPixel, '#8a6a2d')
  }, [durationMs, msPerPixel, resolvedMusicPeaks, tracks.a2.hidden])

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

  const filmstripThumbs = useMemo(() => {
    if (durationMs <= 0) return []
    const count = Math.min(12, Math.max(3, Math.floor(contentWidthPx / 96)))
    const step = durationMs / count
    return Array.from({ length: count }, (_, index) => Math.floor(index * step + step / 2))
  }, [contentWidthPx, durationMs])

  return (
    <div className="videon-cut-timeline videon-cut-timeline--source">
      <div className="videon-cut-timeline__meta">
        <span className="videon-cut-timeline__title">Quell-Timeline</span>
        <Text role="meta">
          {formatClock(playheadMs)} / {formatClock(durationMs)}
        </Text>
        <div className="videon-cut-timeline__zoom">
          <ToolButton
            label="Zoom out"
            disabled={zoomIndex <= 0}
            onClick={() => setZoomIndex((current) => Math.max(current - 1, 0))}
          >
            −
          </ToolButton>
          <Text role="meta">{zoomLevel}×</Text>
          <ToolButton
            label="Zoom in"
            disabled={zoomIndex >= TIMELINE_ZOOM_LEVELS.length - 1}
            onClick={() => setZoomIndex((current) => Math.min(current + 1, TIMELINE_ZOOM_LEVELS.length - 1))}
          >
            +
          </ToolButton>
        </div>
      </div>

      <div className="videon-cut-timeline__viewport" ref={viewportRef}>
        <div className="videon-cut-timeline__layout">
          <div className="videon-cut-timeline__headers">
            <div className="videon-cut-timeline__header-spacer" />
            <TimelineTrackHeader
              id="v1"
              label="V1"
              hidden={tracks.v1.hidden}
              muted={tracks.v1.muted}
              onToggleHidden={() => toggleTrack('v1', 'hidden')}
              onToggleMuted={() => toggleTrack('v1', 'muted')}
              muteHint="Program-Ton stumm"
            />
            <TimelineTrackHeader
              id="si"
              label="SI"
              variant="insight"
              hidden={tracks.si.hidden}
              muted={tracks.si.muted}
              onToggleHidden={() => toggleTrack('si', 'hidden')}
              onToggleMuted={() => toggleTrack('si', 'muted')}
              muteHint="Szene-Insight deaktivieren"
            />
            <TimelineTrackHeader
              id="a1"
              label="A1"
              variant="audio"
              hidden={tracks.a1.hidden}
              muted={tracks.a1.muted}
              onToggleHidden={() => toggleTrack('a1', 'hidden')}
              onToggleMuted={() => toggleTrack('a1', 'muted')}
            />
            <TimelineTrackHeader
              id="a2"
              label="A2"
              variant="audio"
              hidden={tracks.a2.hidden}
              muted={tracks.a2.muted}
              onToggleHidden={() => toggleTrack('a2', 'hidden')}
              onToggleMuted={() => toggleTrack('a2', 'muted')}
            />
            <TimelineTrackHeader
              id="tx"
              label="TX"
              variant="transcript"
              hidden={tracks.tx.hidden}
              muted={tracks.tx.muted}
              onToggleHidden={() => toggleTrack('tx', 'hidden')}
              onToggleMuted={() => toggleTrack('tx', 'muted')}
              muteHint="Transkript deaktivieren"
            />
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
                <TimelineRuler
                  className="videon-cut-timeline__ruler-ds"
                  marks={ticks
                    .filter((tick) => tick.label)
                    .map((tick) => ({
                      id: String(tick.ms),
                      label: tick.label,
                      offsetPct: contentWidthPx > 0 ? (tick.leftPx / contentWidthPx) * 100 : 0,
                    }))}
                />
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--video${tracks.v1.hidden ? ' is-collapsed' : ''}${tracks.v1.muted ? ' is-muted' : ''}`}
                onPointerDown={onTrackPointerDown}
              >
                {!tracks.v1.hidden ? (
                  <>
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
                    <div
                      className="videon-cut-timeline__clip videon-cut-timeline__clip--source"
                      style={{
                        left: '0px',
                        width: `${timelineWidthPx(Math.max(durationMs, 1), msPerPixel)}px`,
                      }}
                      title={mediaLabel}
                    >
                      <div className="videon-cut-timeline__filmstrip">
                        {filmstripThumbs.map((ms) => (
                          <TimelineClipThumbnail key={ms} playbackUrl={playbackUrl} sourceMs={ms} />
                        ))}
                      </div>
                      <span className="videon-cut-timeline__clip-label">{mediaLabel}</span>
                    </div>
                  </>
                ) : null}
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--insight${tracks.si.hidden ? ' is-collapsed' : ''}${tracks.si.muted ? ' is-muted' : ''}`}
                onPointerDown={onTrackPointerDown}
              >
                {!tracks.si.hidden
                  ? scenes.map((scene, index) => {
                      const meta = sceneInsightMeta(scene)
                      const label = timelineClipLabel(scene.summary, 36) || `Szene ${index + 1}`
                      return (
                        <button
                          key={scene.sceneKey}
                          type="button"
                          className={`videon-cut-timeline__clip videon-cut-timeline__clip--insight${activeSceneKey === scene.sceneKey ? ' is-active' : ''}`}
                          style={{
                            left: `${timelineLeftPx(scene.startMs, msPerPixel)}px`,
                            width: `${timelineWidthPx(scene.endMs - scene.startMs, msPerPixel)}px`,
                          }}
                          onClick={(event) => {
                            event.stopPropagation()
                            onSeek(scene.startMs)
                          }}
                          title={[scene.summary, meta].filter(Boolean).join('\n')}
                          disabled={tracks.si.muted}
                        >
                          <span className="videon-cut-timeline__clip-label">{label}</span>
                          {meta ? <span className="videon-cut-timeline__clip-meta">{meta}</span> : null}
                        </button>
                      )
                    })
                  : null}
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--audio${tracks.a1.hidden ? ' is-collapsed' : ''}${tracks.a1.muted ? ' is-muted' : ''}`}
              >
                {!tracks.a1.hidden ? (
                  <canvas
                    ref={voiceCanvasRef}
                    className="videon-cut-timeline__audio-canvas"
                    aria-label="Audio-Spur A1 Voice"
                  />
                ) : null}
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--music${tracks.a2.hidden ? ' is-collapsed' : ''}${tracks.a2.muted ? ' is-muted' : ''}`}
              >
                {!tracks.a2.hidden ? (
                  <canvas
                    ref={musicCanvasRef}
                    className="videon-cut-timeline__audio-canvas"
                    aria-label="Audio-Spur A2 Music"
                  />
                ) : null}
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--transcript${tracks.tx.hidden ? ' is-collapsed' : ''}${tracks.tx.muted ? ' is-muted' : ''}`}
              >
                {!tracks.tx.hidden
                  ? transcriptSegments.map((segment, index) => (
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
                        disabled={tracks.tx.muted}
                      >
                        {timelineClipLabel(segment.text, 28)}
                      </button>
                    ))
                  : null}
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
