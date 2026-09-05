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
import { useJogShuttle } from '@/lib/use-jog-shuttle'
import { computeTrimPreview, type TrimMode } from '@/lib/trim-modes'

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
  onSelectClip: (index: number) => void
  onSeek: (cutMs: number) => void
  onReorder: (sceneIds: string[]) => void
  onTrim: (sceneId: string, startMs: number, endMs: number) => void
  onRollTrim?: (leftSceneId: string, boundaryMs: number) => void
  onDropMedia?: (payload: MediaDragPayload & { afterSceneId?: string | null }) => void
}

const ZOOM_LEVELS = [1, 2, 4, 8] as const

function rulerStepMs(totalDurationMs: number, zoomLevel: number): number {
  if (totalDurationMs <= 30_000) return zoomLevel >= 4 ? 1000 : 2000
  if (totalDurationMs <= 120_000) return zoomLevel >= 4 ? 5000 : 10_000
  return zoomLevel >= 4 ? 15_000 : 30_000
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
  const [zoomIndex, setZoomIndex] = useState(0)
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
    nextClip?: { startMs: number; endMs: number; sameMedia: boolean }
  } | null>(null)

  const zoomLevel = ZOOM_LEVELS[zoomIndex] ?? 1

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
      const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
      onSeek(Math.floor(ratio * totalDurationMs))
    },
    [onSeek, totalDurationMs],
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
      const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
      setDropHintMs(Math.floor(ratio * totalDurationMs))
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
              Math.min(
                Math.max((event.clientX - lanesRef.current.getBoundingClientRect().left) / lanesRef.current.getBoundingClientRect().width, 0),
                1,
              ) * totalDurationMs,
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
    trimRef.current = {
      sceneId: item.scene.id,
      edge,
      startMs: item.scene.startMs,
      endMs: item.scene.endMs,
      pointerStartX: event.clientX,
      clipWidthPx: clipElement.getBoundingClientRect().width,
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

  const playheadLeft = totalDurationMs > 0 ? (cutPlayheadMs / totalDurationMs) * 100 : 0
  const dropHintLeft = dropHintMs !== null && totalDurationMs > 0 ? (dropHintMs / totalDurationMs) * 100 : null
  const laneStyle = { width: `${zoomLevel * 100}%` }
  const stepMs = rulerStepMs(totalDurationMs, zoomLevel)
  const rulerTicks = useMemo(() => {
    if (totalDurationMs <= 0) return []
    const ticks: Array<{ ms: number; left: number; major: boolean }> = []
    for (let ms = 0; ms <= totalDurationMs; ms += stepMs) {
      ticks.push({ ms, left: (ms / totalDurationMs) * 100, major: ms % (stepMs * 2) === 0 })
    }
    return ticks
  }, [stepMs, totalDurationMs])

  return (
    <div className="videon-cut-timeline">
      <div className="videon-cut-timeline__meta">
        <span className="videon-cut-timeline__title">Sequenz · {trimMode.toUpperCase()}</span>
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
            {transcriptSegments.length > 0 ? (
              <div className="videon-cut-timeline__header-label videon-cut-timeline__header-label--transcript">TX</div>
            ) : null}
          </div>
          <div className="videon-cut-timeline__lanes-wrap">
            <div className="videon-cut-timeline__lanes" style={laneStyle} ref={lanesRef}>
              <div className="videon-cut-timeline__ruler" onPointerDown={onTrackPointerDown}>
                {rulerTicks.map((tick) => (
                  <div
                    key={tick.ms}
                    className={`videon-cut-timeline__ruler-tick${tick.major ? ' is-major' : ''}`}
                    style={{ left: `${tick.left}%` }}
                  >
                    {tick.major ? <span>{formatClock(tick.ms)}</span> : null}
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
                  const left = totalDurationMs > 0 ? (item.cutStartMs / totalDurationMs) * 100 : 0
                  const width = totalDurationMs > 0 ? Math.max((item.durationMs / totalDurationMs) * 100, 1.2) : 0
                  const isActive = item.index === activeIndex
                  const clip = clips[item.index]
                  const label = clip?.media?.originalFilename ?? `Clip ${item.index + 1}`
                  const thumbMs = item.scene.startMs + Math.floor(item.durationMs / 2)
                  const playbackUrl = clip ? playbackUrlByMediaId[clip.scene.mediaAssetId] ?? null : null
                  return (
                    <div
                      key={item.scene.id}
                      className={`videon-cut-timeline__clip${isActive ? ' is-active' : ''}${dragSceneId === item.scene.id ? ' is-dragging' : ''}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
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
                            onPointerDown={(event) => startTrim(event, item, 'start')}
                            onPointerMove={onTrimPointerMove}
                            onPointerUp={endTrim}
                            onPointerCancel={endTrim}
                          />
                          <span
                            className="videon-cut-timeline__clip-handle videon-cut-timeline__clip-handle--end"
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
                {dropHintLeft !== null ? (
                  <div className="videon-cut-timeline__drop-hint" style={{ left: `${dropHintLeft}%` }} />
                ) : null}
              </div>

              <div className="videon-cut-timeline__track videon-cut-timeline__track--audio">
                <TimelineAudioTrack
                  timeline={timeline}
                  totalDurationMs={totalDurationMs}
                  peaksByUrl={peaksByUrl}
                  playbackUrlByMediaId={playbackUrlByMediaId}
                  clips={clips}
                />
              </div>

              {transcriptSegments.length > 0 ? (
                <div className="videon-cut-timeline__track videon-cut-timeline__track--transcript">
                  {transcriptSegments.map((segment, index) => {
                    const left = totalDurationMs > 0 ? (segment.cutStartMs / totalDurationMs) * 100 : 0
                    const width =
                      totalDurationMs > 0
                        ? Math.max(((segment.cutEndMs - segment.cutStartMs) / totalDurationMs) * 100, 0.8)
                        : 0
                    return (
                      <button
                        key={`${segment.cutStartMs}-${index}`}
                        type="button"
                        className="videon-cut-timeline__transcript-segment"
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={segment.text}
                        onClick={() => onSeek(segment.cutStartMs)}
                      >
                        {segment.text}
                      </button>
                    )
                  })}
                </div>
              ) : null}

              <div
                className="videon-cut-timeline__playhead"
                style={{ left: `${playheadLeft}%` }}
                onPointerDown={startPlayheadDrag}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
