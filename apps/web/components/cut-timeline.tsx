'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Text } from '@msqdx/ui'
import { TimelineAudioTrack } from '@/components/timeline-audio-track'
import { TimelineClipThumbnail } from '@/components/timeline-clip-thumbnail'
import {
  MIN_CUT_CLIP_MS,
  buildCutTimeline,
  type CutTimelineItem,
  type CutTranscriptSegment,
} from '@/lib/cut-timeline'
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
import { computeTrimPreview, TRIM_MODE_HELP, TRIM_MODE_LABELS, type TrimMode } from '@/lib/trim-modes'

export type CutTimelineClip = {
  scene: {
    id: string
    position: number
    startMs: number
    endMs: number
    mediaAssetId: string
  }
  media: { id: string; originalFilename: string } | null
}

export const MEDIA_DRAG_TYPE = 'application/vnd.videon.media+json'

type MediaDragPayload = {
  mediaAssetId: string
  startMs: number
  endMs: number
}

type CutTimelineProps = {
  clips: CutTimelineClip[]
  activeIndex: number
  cutPlayheadMs: number
  totalDurationMs: number
  transcriptSegments?: CutTranscriptSegment[]
  trimMode?: TrimMode
  disabled?: boolean
  playbackUrlByMediaId?: Record<string, string>
  peaksByUrl?: Record<string, number[]>
  voicePeaksByMediaId?: Record<string, number[]>
  musicPeaksByMediaId?: Record<string, number[]>
  sourceDurationMsByMediaId?: Record<string, number>
  onSelectClip: (index: number) => void
  onSeek: (cutMs: number) => void
  onReorder: (sceneIds: string[]) => void
  onTrim: (sceneId: string, startMs: number, endMs: number) => void
  onRollTrim?: (leftSceneId: string, boundaryMs: number) => void
  onDropMedia?: (payload: MediaDragPayload & { afterSceneId?: string | null }) => void
}


export function CutTimeline({
  clips,
  activeIndex,
  cutPlayheadMs,
  totalDurationMs,
  transcriptSegments = [],
  trimMode = 'trim',
  disabled = false,
  playbackUrlByMediaId = {},
  peaksByUrl = {},
  voicePeaksByMediaId = {},
  musicPeaksByMediaId = {},
  sourceDurationMsByMediaId = {},
  onSelectClip,
  onSeek,
  onReorder,
  onTrim,
  onRollTrim,
  onDropMedia,
}: CutTimelineProps) {
  const videoTrackRef = useRef<HTMLDivElement | null>(null)
  const lanesRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [dragSceneId, setDragSceneId] = useState<string | null>(null)
  const [zoomIndex, setZoomIndex] = useState(defaultTimelineZoomIndex)

  const [trimPreview, setTrimPreview] = useState<{
    sceneId: string
    startMs: number
    endMs: number
    rollBoundaryMs?: number
  } | null>(null)
  const [dropHintMs, setDropHintMs] = useState<number | null>(null)
  const trimRef = useRef<{
    sceneId: string
    edge: 'start' | 'end'
    startMs: number
    endMs: number
    pointerStartX: number
    clipWidthPx: number
    mediaDurationMs: number
    nextClip?: { startMs: number; endMs: number; sameMedia: boolean }
  } | null>(null)

  const zoomLevel = TIMELINE_ZOOM_LEVELS[zoomIndex] ?? 1
  const msPerPixel = timelineMsPerPixel(zoomLevel)
  const contentWidthPx = timelineContentWidthPx(totalDurationMs, zoomLevel)
  const ticks = useMemo(() => buildTimelineTicks(totalDurationMs, zoomLevel), [totalDurationMs, zoomLevel])

  const timeline = useMemo(() => {
    const scenes = clips.map((clip) => ({
      id: clip.scene.id,
      position: clip.scene.position,
      mediaAssetId: clip.scene.mediaAssetId,
      startMs: trimPreview?.sceneId === clip.scene.id ? trimPreview.startMs : clip.scene.startMs,
      endMs: trimPreview?.sceneId === clip.scene.id ? trimPreview.endMs : clip.scene.endMs,
    }))
    return buildCutTimeline(scenes)
  }, [clips, trimPreview])

  const seekFromPointer = useCallback(
    (clientX: number, track: HTMLDivElement | null = lanesRef.current) => {
      if (!track || totalDurationMs <= 0) return
      const rect = track.getBoundingClientRect()
      const x = Math.min(Math.max(clientX - rect.left, 0), contentWidthPx)
      onSeek(Math.floor(x * msPerPixel))
    },
    [contentWidthPx, msPerPixel, onSeek, totalDurationMs],
  )

  useJogShuttle(viewportRef, (deltaMs) => onSeek(cutPlayheadMs + deltaMs), { enabled: !disabled })

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || (event.target as HTMLElement).closest('.videon-cut-timeline__clip-handle')) return
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

  const onClipDragStart = (event: React.DragEvent<HTMLDivElement>, sceneId: string) => {
    if (disabled) return
    setDragSceneId(sceneId)
    event.dataTransfer.setData('text/plain', sceneId)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onClipDrop = (targetSceneId: string) => {
    if (!dragSceneId || dragSceneId === targetSceneId) {
      setDragSceneId(null)
      return
    }
    const ids = timeline.map((item) => item.scene.id)
    const from = ids.indexOf(dragSceneId)
    const to = ids.indexOf(targetSceneId)
    if (from < 0 || to < 0) {
      setDragSceneId(null)
      return
    }
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onReorder(next)
    setDragSceneId(null)
  }

  const onTrackDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (disabled || !onDropMedia) return
    if (!event.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (lanesRef.current && totalDurationMs > 0) {
      const rect = lanesRef.current.getBoundingClientRect()
      const x = Math.min(Math.max(event.clientX - rect.left, 0), contentWidthPx)
      setDropHintMs(Math.floor(x * msPerPixel))
    }
  }

  const onTrackDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDropHintMs(null)
    if (disabled || !onDropMedia) return
    const raw = event.dataTransfer.getData(MEDIA_DRAG_TYPE)
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as MediaDragPayload
      if (!payload.mediaAssetId) return
      const cutMs =
        lanesRef.current && totalDurationMs > 0
          ? Math.floor(
              Math.min(Math.max(event.clientX - lanesRef.current.getBoundingClientRect().left, 0), contentWidthPx) *
                msPerPixel,
            )
          : totalDurationMs
      const afterIndex = timeline.findIndex((item) => cutMs >= item.cutStartMs && cutMs < item.cutEndMs)
      const afterSceneId = afterIndex >= 0 ? timeline[afterIndex]?.scene.id ?? null : timeline.at(-1)?.scene.id ?? null
      onDropMedia({ ...payload, afterSceneId })
    } catch {
      // ignore invalid drag payloads
    }
  }

  const startTrim = (event: React.PointerEvent<HTMLSpanElement>, item: CutTimelineItem, edge: 'start' | 'end') => {
    event.stopPropagation()
    if (disabled) return
    const clipElement = event.currentTarget.closest('.videon-cut-timeline__clip')
    if (!clipElement) return
    const nextClip = clips[item.index + 1]
    const sameMedia = nextClip?.scene.mediaAssetId === item.scene.mediaAssetId
    const mediaDurationMs =
      sourceDurationMsByMediaId[item.scene.mediaAssetId] ?? Math.max(item.scene.endMs, item.durationMs)
    trimRef.current = {
      sceneId: item.scene.id,
      edge,
      startMs: item.scene.startMs,
      endMs: item.scene.endMs,
      pointerStartX: event.clientX,
      clipWidthPx: clipElement.getBoundingClientRect().width,
      mediaDurationMs,
      nextClip: nextClip
        ? { startMs: nextClip.scene.startMs, endMs: nextClip.scene.endMs, sameMedia }
        : undefined,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onTrimPointerMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const trim = trimRef.current
    if (!trim || trim.clipWidthPx <= 0) return
    const sourceDuration = trim.endMs - trim.startMs
    const deltaPx = event.clientX - trim.pointerStartX
    const sourceDelta = Math.round((deltaPx / trim.clipWidthPx) * sourceDuration)
    const preview = computeTrimPreview({
      mode: trimMode,
      edge: trim.edge,
      startMs: trim.startMs,
      endMs: trim.endMs,
      sourceDelta,
      mediaDurationMs: trim.mediaDurationMs,
      nextClip: trim.nextClip ?? null,
    })
    if (!preview) return
    setTrimPreview({ sceneId: trim.sceneId, ...preview })
  }

  const endTrim = (event: React.PointerEvent<HTMLSpanElement>) => {
    const trim = trimRef.current
    const preview = trimPreview
    trimRef.current = null
    setTrimPreview(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!trim || !preview || preview.sceneId !== trim.sceneId) return
    if (preview.rollBoundaryMs !== undefined && onRollTrim) {
      if (preview.rollBoundaryMs !== trim.endMs) onRollTrim(trim.sceneId, preview.rollBoundaryMs)
      return
    }
    if (preview.startMs === trim.startMs && preview.endMs === trim.endMs) return
    onTrim(preview.sceneId, preview.startMs, preview.endMs)
  }

  const playheadLeftPx = timelineLeftPx(cutPlayheadMs, msPerPixel)
  const dropHintLeftPx = dropHintMs !== null ? timelineLeftPx(dropHintMs, msPerPixel) : null
  usePlayheadFollow(viewportRef, playheadLeftPx, !disabled)
  const activeTxIndex = useMemo(
    () =>
      activeTranscriptIndex(
        cutPlayheadMs,
        transcriptSegments.map((segment) => ({ startMs: segment.cutStartMs, endMs: segment.cutEndMs })),
      ),
    [cutPlayheadMs, transcriptSegments],
  )

  return (
    <div className="videon-cut-timeline">
      <div className="videon-cut-timeline__meta">
        <span className="videon-cut-timeline__title" title={TRIM_MODE_HELP[trimMode]}>
          Sequenz · {TRIM_MODE_LABELS[trimMode]}
        </span>
        <Text role="meta">
          {formatClock(cutPlayheadMs)} / {formatClock(totalDurationMs)}
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
                ref={videoTrackRef}
                className="videon-cut-timeline__track videon-cut-timeline__track--video"
                onPointerDown={onTrackPointerDown}
                onDragOver={onTrackDragOver}
                onDragLeave={() => setDropHintMs(null)}
                onDrop={onTrackDrop}
                role="slider"
                aria-label="Video-Spur"
                aria-valuemin={0}
                aria-valuemax={totalDurationMs}
                aria-valuenow={cutPlayheadMs}
              >
                {timeline.map((item) => {
                  const leftPx = timelineLeftPx(item.cutStartMs, msPerPixel)
                  const widthPx = timelineWidthPx(item.durationMs, msPerPixel)
                  const isActive = item.index === activeIndex
                  const clip = clips[item.index]
                  const label = clip?.media?.originalFilename ?? `Clip ${item.index + 1}`
                  const thumbMs = item.scene.startMs + Math.floor(item.durationMs / 2)
                  const playbackUrl = clip ? playbackUrlByMediaId[clip.scene.mediaAssetId] ?? null : null
                  return (
                    <div
                      key={item.scene.id}
                      className={`videon-cut-timeline__clip${isActive ? ' is-active' : ''}${dragSceneId === item.scene.id ? ' is-dragging' : ''}`}
                      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                      draggable={!disabled}
                      onDragStart={(event) => onClipDragStart(event, item.scene.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => onClipDrop(item.scene.id)}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectClip(item.index)
                        seekFromPointer(event.clientX)
                      }}
                      title={label}
                    >
                      <TimelineClipThumbnail playbackUrl={playbackUrl} sourceMs={thumbMs} />
                      {isActive ? (
                        <>
                          <span
                            className="videon-cut-timeline__clip-handle videon-cut-timeline__clip-handle--start"
                            title={
                              trimMode === 'trim'
                                ? 'Slip: Fenster schieben'
                                : trimMode === 'ripple'
                                  ? 'Ripple: Startkante (Dauer)'
                                  : 'Roll: gemeinsame Grenze'
                            }
                            onPointerDown={(event) => startTrim(event, item, 'start')}
                            onPointerMove={onTrimPointerMove}
                            onPointerUp={endTrim}
                            onPointerCancel={endTrim}
                          />
                          <span
                            className="videon-cut-timeline__clip-handle videon-cut-timeline__clip-handle--end"
                            title={
                              trimMode === 'trim'
                                ? 'Slip: Fenster schieben'
                                : trimMode === 'ripple'
                                  ? 'Ripple: Endkante (Dauer)'
                                  : 'Roll: gemeinsame Grenze'
                            }
                            onPointerDown={(event) => startTrim(event, item, 'end')}
                            onPointerMove={onTrimPointerMove}
                            onPointerUp={endTrim}
                            onPointerCancel={endTrim}
                          />
                        </>
                      ) : null}
                      <span className="videon-cut-timeline__clip-label">{label}</span>
                    </div>
                  )
                })}
                {dropHintLeftPx !== null ? (
                  <div className="videon-cut-timeline__drop-hint" style={{ left: `${dropHintLeftPx}px` }} />
                ) : null}
              </div>

              <div className="videon-cut-timeline__track videon-cut-timeline__track--audio">
                <TimelineAudioTrack
                  timeline={timeline}
                  totalDurationMs={totalDurationMs}
                  msPerPixel={msPerPixel}
                  peaksByUrl={peaksByUrl}
                  peaksByMediaId={voicePeaksByMediaId}
                  playbackUrlByMediaId={playbackUrlByMediaId}
                  sourceDurationMsByMediaId={sourceDurationMsByMediaId}
                  clips={clips}
                  color="#2d6a9f"
                  label="Audio-Spur A1 Voice"
                />
              </div>

              <div className="videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--music">
                <TimelineAudioTrack
                  timeline={timeline}
                  totalDurationMs={totalDurationMs}
                  msPerPixel={msPerPixel}
                  peaksByUrl={{}}
                  peaksByMediaId={musicPeaksByMediaId}
                  playbackUrlByMediaId={playbackUrlByMediaId}
                  sourceDurationMsByMediaId={sourceDurationMsByMediaId}
                  clips={clips}
                  color="#8a6a2d"
                  label="Audio-Spur A2 Music"
                />
              </div>

              <div className="videon-cut-timeline__track videon-cut-timeline__track--transcript">
                {transcriptSegments.map((segment, index) => {
                  const leftPx = timelineLeftPx(segment.cutStartMs, msPerPixel)
                  const widthPx = timelineWidthPx(segment.cutEndMs - segment.cutStartMs, msPerPixel, 4)
                  return (
                    <button
                      key={`${segment.cutStartMs}-${index}`}
                      type="button"
                      className={`videon-cut-timeline__transcript-segment${activeTxIndex === index ? ' is-active' : ''}`}
                      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                      title={segment.text}
                      onClick={() => onSeek(segment.cutStartMs)}
                    >
                      {segment.text}
                    </button>
                  )
                })}
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
