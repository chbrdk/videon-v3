'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import { Text, TimelineClip, TimelineRuler, ToolButton } from '@msqdx/ui'
import { TimelineAudioTrack } from '@/components/timeline-audio-track'
import { TimelineClipThumbnail } from '@/components/timeline-clip-thumbnail'
import {
  DEFAULT_CUT_TRACK_STATE,
  TimelineTrackHeader,
  type TimelineTrackState,
} from '@/components/timeline-track-header'
import type { ProgramTrackMutes } from '@/lib/use-program-audio-mixer'
import {
  MIN_CUT_CLIP_MS,
  buildCutTimeline,
  type CutTimelineItem,
  type CutTranscriptSegment,
} from '@/lib/cut-timeline'
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
import { computeTrimPreview, TRIM_MODE_HELP, TRIM_MODE_LABELS, type TrimMode } from '@/lib/trim-modes'
import { cutEdgeSnapPoints, snapCutMs } from '@/lib/timeline-snap'
import type { CutTimelineContextMenuRequest } from '@/lib/cut-timeline-context-menu'

export type CutTimelineClip = {
  scene: {
    id: string
    position: number
    startMs: number
    endMs: number
    timelineStartMs?: number
    mediaAssetId: string
  }
  media: { id: string; originalFilename: string } | null
}

export type CutTimelineAudioClip = {
  id: string
  trackId: string
  mediaAssetId: string
  timelineStartMs: number
  startMs: number
  endMs: number
  label?: string
}

export const MEDIA_DRAG_TYPE = 'application/vnd.videon.media+json'
export const AUDIO_BUS_DRAG_TYPE = 'application/vnd.videon.audio-bus+json'

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
  platformProjectId?: string
  playbackUrlByMediaId?: Record<string, string>
  peaksByUrl?: Record<string, number[]>
  voicePeaksByMediaId?: Record<string, number[]>
  musicPeaksByMediaId?: Record<string, number[]>
  mixPeaksByMediaId?: Record<string, number[]>
  sourceDurationMsByMediaId?: Record<string, number>
  audioClips?: CutTimelineAudioClip[]
  audioBusLabel?: string
  audioBusMuted?: boolean
  selectedAudioClipId?: string | null
  onSelectClip: (index: number) => void
  onSeek: (cutMs: number) => void
  onReorder: (sceneIds: string[]) => void
  onMoveClip?: (sceneId: string, timelineStartMs: number) => void
  onTrim: (sceneId: string, startMs: number, endMs: number, timelineStartMs?: number) => void
  onRollTrim?: (leftSceneId: string, boundaryMs: number) => void
  onDropMedia?: (payload: MediaDragPayload & { afterSceneId?: string | null; timelineStartMs?: number }) => void
  onDropAudioBus?: (payload: MediaDragPayload & { timelineStartMs: number }) => void
  onSelectAudioClip?: (clipId: string | null) => void
  onMoveAudioClip?: (clipId: string, timelineStartMs: number) => void
  onDeleteAudioClip?: (clipId: string) => void
  onToggleAudioBusMuted?: () => void
  onContextMenuRequest?: (request: CutTimelineContextMenuRequest) => void
  /** Per-track mute for the program audio mixer. */
  onTrackMutesChange?: (mutes: ProgramTrackMutes) => void
  hasStemAudio?: boolean
}


export function CutTimeline({
  clips,
  activeIndex,
  cutPlayheadMs,
  totalDurationMs,
  transcriptSegments = [],
  trimMode = 'ripple',
  disabled = false,
  platformProjectId,
  playbackUrlByMediaId = {},
  peaksByUrl = {},
  voicePeaksByMediaId = {},
  musicPeaksByMediaId = {},
  mixPeaksByMediaId = {},
  sourceDurationMsByMediaId = {},
  audioClips = [],
  audioBusLabel = 'Voice-Over',
  audioBusMuted = false,
  selectedAudioClipId = null,
  onSelectClip,
  onSeek,
  onReorder,
  onMoveClip,
  onTrim,
  onRollTrim,
  onDropMedia,
  onDropAudioBus,
  onSelectAudioClip,
  onMoveAudioClip,
  onDeleteAudioClip,
  onToggleAudioBusMuted,
  onContextMenuRequest,
  onTrackMutesChange,
  hasStemAudio = false,
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
    timelineStartMs?: number
    rollBoundaryMs?: number
  } | null>(null)
  const [movePreview, setMovePreview] = useState<{ sceneId: string; timelineStartMs: number } | null>(null)
  const [dropHintMs, setDropHintMs] = useState<number | null>(null)
  const [tracks, setTracks] = useState(DEFAULT_CUT_TRACK_STATE)
  const trimRef = useRef<{
    sceneId: string
    edge: 'start' | 'end'
    startMs: number
    endMs: number
    timelineStartMs: number
    pointerStartX: number
    clipWidthPx: number
    mediaDurationMs: number
    nextClip?: { startMs: number; endMs: number; sameMedia: boolean }
  } | null>(null)
  const moveRef = useRef<{
    sceneId: string
    originTimelineStartMs: number
    pointerStartX: number
    armed: boolean
    previewStartMs: number
  } | null>(null)

  const zoomLevel = TIMELINE_ZOOM_LEVELS[zoomIndex] ?? 1
  const msPerPixel = timelineMsPerPixel(zoomLevel)
  const contentWidthPx = timelineContentWidthPx(totalDurationMs, zoomLevel)
  const ticks = useMemo(() => buildTimelineTicks(totalDurationMs, zoomLevel), [totalDurationMs, zoomLevel])

  const toggleTrack = useCallback((id: keyof typeof DEFAULT_CUT_TRACK_STATE, field: keyof TimelineTrackState) => {
    setTracks((current) => ({
      ...current,
      [id]: { ...current[id], [field]: !current[id][field] },
    }))
  }, [])

  useEffect(() => {
    if (!hasStemAudio) return
    setTracks((current) =>
      current.v1.muted ? current : { ...current, v1: { ...current.v1, muted: true } },
    )
  }, [hasStemAudio])

  useEffect(() => {
    setTracks((current) =>
      current.ab.muted === audioBusMuted ? current : { ...current, ab: { ...current.ab, muted: audioBusMuted } },
    )
  }, [audioBusMuted])

  useEffect(() => {
    onTrackMutesChange?.({
      v1: tracks.v1.muted,
      a1: tracks.a1.muted,
      a2: tracks.a2.muted,
      ab: tracks.ab.muted,
    })
  }, [tracks.v1.muted, tracks.a1.muted, tracks.a2.muted, tracks.ab.muted, onTrackMutesChange])

  const timeline = useMemo(() => {
    const scenes = clips.map((clip) => {
      const trimming = trimPreview?.sceneId === clip.scene.id
      const moving = movePreview?.sceneId === clip.scene.id
      const baseTimelineStart = clip.scene.timelineStartMs ?? 0
      let timelineStartMs = baseTimelineStart
      if (trimming && typeof trimPreview.timelineStartMs === 'number') {
        timelineStartMs = trimPreview.timelineStartMs
      } else if (moving) {
        timelineStartMs = movePreview.timelineStartMs
      }
      return {
        id: clip.scene.id,
        position: clip.scene.position,
        mediaAssetId: clip.scene.mediaAssetId,
        startMs: trimming ? trimPreview.startMs : clip.scene.startMs,
        endMs: trimming ? trimPreview.endMs : clip.scene.endMs,
        timelineStartMs,
      }
    })
    return buildCutTimeline(scenes)
  }, [clips, trimPreview, movePreview])

  const snapPoints = useMemo(
    () => cutEdgeSnapPoints(timeline, cutPlayheadMs),
    [timeline, cutPlayheadMs],
  )

  const seekFromPointer = useCallback(
    (clientX: number, track: HTMLDivElement | null = lanesRef.current) => {
      if (!track || totalDurationMs <= 0) return
      const rect = track.getBoundingClientRect()
      const x = Math.min(Math.max(clientX - rect.left, 0), contentWidthPx)
      const raw = Math.floor(x * msPerPixel)
      onSeek(snapCutMs(raw, snapPoints))
    },
    [contentWidthPx, msPerPixel, onSeek, snapPoints, totalDurationMs],
  )

  useJogShuttle(viewportRef, (deltaMs) => onSeek(cutPlayheadMs + deltaMs), { enabled: !disabled })

  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || (event.target as HTMLElement).closest('.videon-cut-timeline__clip-handle')) return
    seekFromPointer(event.clientX)
  }

  const startPlayheadDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
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

  const emitLaneContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      if (disabled || !onContextMenuRequest) return
      event.preventDefault()
      const rect = lanesRef.current?.getBoundingClientRect()
      const raw =
        rect && totalDurationMs > 0
          ? Math.floor(Math.min(Math.max(event.clientX - rect.left, 0), contentWidthPx) * msPerPixel)
          : cutPlayheadMs
      onContextMenuRequest({
        kind: 'cut-lane',
        atMs: snapCutMs(raw, snapPoints),
        clientX: event.clientX,
        clientY: event.clientY,
      })
    },
    [
      contentWidthPx,
      cutPlayheadMs,
      disabled,
      msPerPixel,
      onContextMenuRequest,
      snapPoints,
      totalDurationMs,
    ],
  )

  const emitClipContextMenu = useCallback(
    (event: ReactMouseEvent, item: CutTimelineItem) => {
      if (disabled || !onContextMenuRequest) return
      event.preventDefault()
      event.stopPropagation()
      const duration = item.cutEndMs - item.cutStartMs
      const canSplit =
        cutPlayheadMs > item.cutStartMs + MIN_CUT_CLIP_MS &&
        cutPlayheadMs < item.cutEndMs - MIN_CUT_CLIP_MS &&
        duration > MIN_CUT_CLIP_MS * 2
      onContextMenuRequest({
        kind: 'cut-clip',
        sceneId: item.scene.id,
        index: item.index,
        cutStartMs: item.cutStartMs,
        cutEndMs: item.cutEndMs,
        canMerge: item.index < clips.length - 1,
        canDelete: clips.length > 1,
        canSplit,
        clientX: event.clientX,
        clientY: event.clientY,
      })
    },
    [clips.length, cutPlayheadMs, disabled, onContextMenuRequest],
  )

  const onClipDragStart = (event: DragEvent<HTMLDivElement>, sceneId: string) => {
    if (disabled || onMoveClip) {
      event.preventDefault()
      return
    }
    setDragSceneId(sceneId)
    event.dataTransfer.setData('text/plain', sceneId)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onClipDrop = (targetSceneId: string) => {
    if (onMoveClip) {
      setDragSceneId(null)
      return
    }
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

  const startClipMove = (event: ReactPointerEvent<HTMLDivElement>, item: CutTimelineItem) => {
    if (disabled || !onMoveClip || tracks.v1.muted) return
    if ((event.target as HTMLElement).closest('.videon-cut-timeline__clip-handle')) return
    event.stopPropagation()
    const origin = {
      sceneId: item.scene.id,
      originTimelineStartMs: item.cutStartMs,
      pointerStartX: event.clientX,
      armed: false,
      previewStartMs: item.cutStartMs,
    }
    moveRef.current = origin

    const onMove = (moveEvent: PointerEvent) => {
      const current = moveRef.current
      if (!current || current.sceneId !== origin.sceneId) return
      const deltaPx = moveEvent.clientX - current.pointerStartX
      if (!current.armed && Math.abs(deltaPx) < 5) return
      current.armed = true
      setDragSceneId(current.sceneId)
      const deltaMs = Math.round(deltaPx * msPerPixel)
      const nextStart = Math.max(0, snapCutMs(current.originTimelineStartMs + deltaMs, snapPoints))
      current.previewStartMs = nextStart
      setMovePreview({ sceneId: current.sceneId, timelineStartMs: nextStart })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const current = moveRef.current
      moveRef.current = null
      setDragSceneId(null)
      setMovePreview(null)
      if (!current?.armed || !onMoveClip) return
      if (current.previewStartMs === current.originTimelineStartMs) return
      onMoveClip(current.sceneId, current.previewStartMs)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onTrackDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !onDropMedia) return
    if (!event.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (lanesRef.current) {
      const rect = lanesRef.current.getBoundingClientRect()
      const maxX = Math.max(contentWidthPx, rect.width)
      const x = Math.min(Math.max(event.clientX - rect.left, 0), maxX)
      setDropHintMs(snapCutMs(Math.floor(x * msPerPixel), snapPoints))
    }
  }

  const onTrackDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDropHintMs(null)
    if (disabled || !onDropMedia) return
    const raw = event.dataTransfer.getData(MEDIA_DRAG_TYPE)
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as MediaDragPayload
      if (!payload.mediaAssetId) return
      const rect = lanesRef.current?.getBoundingClientRect()
      const maxX = Math.max(contentWidthPx, rect?.width ?? 0)
      const cutMs =
        rect != null
          ? snapCutMs(
              Math.floor(Math.min(Math.max(event.clientX - rect.left, 0), maxX) * msPerPixel),
              snapPoints,
            )
          : totalDurationMs
      onDropMedia({ ...payload, timelineStartMs: cutMs, afterSceneId: null })
    } catch {
      // ignore invalid drag payloads
    }
  }

  const onBusDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !onDropAudioBus) return
    if (
      !event.dataTransfer.types.includes(MEDIA_DRAG_TYPE) &&
      !event.dataTransfer.types.includes(AUDIO_BUS_DRAG_TYPE)
    ) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const onBusDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (disabled || !onDropAudioBus) return
    const raw =
      event.dataTransfer.getData(AUDIO_BUS_DRAG_TYPE) || event.dataTransfer.getData(MEDIA_DRAG_TYPE)
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as MediaDragPayload
      if (!payload.mediaAssetId) return
      const cutMs =
        lanesRef.current && totalDurationMs > 0
          ? snapCutMs(
              Math.floor(
                Math.min(Math.max(event.clientX - lanesRef.current.getBoundingClientRect().left, 0), contentWidthPx) *
                  msPerPixel,
              ),
              snapPoints,
            )
          : 0
      onDropAudioBus({ ...payload, timelineStartMs: cutMs })
    } catch {
      /* ignore */
    }
  }

  const startTrim = (event: ReactPointerEvent<HTMLSpanElement>, item: CutTimelineItem, edge: 'start' | 'end') => {
    event.stopPropagation()
    if (disabled) return
    const clipElement = event.currentTarget.closest('.videon-cut-timeline__clip')
    if (!clipElement) return
    const nextByTime = timeline.find(
      (entry) =>
        entry.scene.id !== item.scene.id &&
        Math.abs(entry.cutStartMs - item.cutEndMs) < 2,
    )
    const nextClip = nextByTime
      ? clips.find((clip) => clip.scene.id === nextByTime.scene.id)
      : undefined
    const sameMedia = nextClip?.scene.mediaAssetId === item.scene.mediaAssetId
    const mediaDurationMs =
      sourceDurationMsByMediaId[item.scene.mediaAssetId] ?? Math.max(item.scene.endMs, item.durationMs)
    trimRef.current = {
      sceneId: item.scene.id,
      edge,
      startMs: item.scene.startMs,
      endMs: item.scene.endMs,
      timelineStartMs: item.cutStartMs,
      pointerStartX: event.clientX,
      clipWidthPx: clipElement.getBoundingClientRect().width,
      mediaDurationMs,
      nextClip: nextClip
        ? { startMs: nextClip.scene.startMs, endMs: nextClip.scene.endMs, sameMedia: Boolean(sameMedia) }
        : undefined,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onTrimPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const trim = trimRef.current
    if (!trim || trim.clipWidthPx <= 0) return
    const deltaPx = event.clientX - trim.pointerStartX
    const sourceDelta =
      trimMode === 'trim'
        ? Math.round((deltaPx / trim.clipWidthPx) * (trim.endMs - trim.startMs))
        : Math.round(deltaPx * msPerPixel)
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
    const timelineStartMs =
      trimMode !== 'trim' && trim.edge === 'start'
        ? Math.max(0, trim.timelineStartMs + (preview.startMs - trim.startMs))
        : trim.timelineStartMs
    setTrimPreview({ sceneId: trim.sceneId, ...preview, timelineStartMs })
  }

  const endTrim = (event: ReactPointerEvent<HTMLSpanElement>) => {
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
    if (
      preview.startMs === trim.startMs &&
      preview.endMs === trim.endMs &&
      (preview.timelineStartMs ?? trim.timelineStartMs) === trim.timelineStartMs
    ) {
      return
    }
    onTrim(preview.sceneId, preview.startMs, preview.endMs, preview.timelineStartMs)
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
              muteHint={hasStemAudio ? 'Originalton (nach Split stumm)' : 'Program-Ton stumm'}
            />
            <TimelineTrackHeader
              id="a1"
              label="A1 · Source"
              variant="audio"
              hidden={tracks.a1.hidden}
              muted={tracks.a1.muted}
              onToggleHidden={() => toggleTrack('a1', 'hidden')}
              onToggleMuted={() => toggleTrack('a1', 'muted')}
              muteHint={hasStemAudio ? 'Source Audio Voice (Visual)' : 'Source Audio (Visual)'}
            />
            <TimelineTrackHeader
              id="a2"
              label="A2 · Source"
              variant="audio"
              hidden={tracks.a2.hidden}
              muted={tracks.a2.muted}
              onToggleHidden={() => toggleTrack('a2', 'hidden')}
              onToggleMuted={() => toggleTrack('a2', 'muted')}
              muteHint={hasStemAudio ? 'Source Audio Music (Visual)' : 'Source Audio Music (Visual)'}
            />
            <TimelineTrackHeader
              id="ab"
              label="A3 · VO"
              variant="audio"
              hidden={tracks.ab.hidden}
              muted={tracks.ab.muted}
              onToggleHidden={() => toggleTrack('ab', 'hidden')}
              onToggleMuted={() => {
                toggleTrack('ab', 'muted')
                onToggleAudioBusMuted?.()
              }}
              muteHint={`${audioBusLabel} stumm`}
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
              <div
                className="videon-cut-timeline__ruler"
                onPointerDown={onTrackPointerDown}
                onContextMenu={emitLaneContextMenu}
              >
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
                ref={videoTrackRef}
                className={`videon-cut-timeline__track videon-cut-timeline__track--video${tracks.v1.hidden ? ' is-collapsed' : ''}${tracks.v1.muted ? ' is-muted' : ''}`}
                onPointerDown={onTrackPointerDown}
                onContextMenu={emitLaneContextMenu}
                onDragOver={onTrackDragOver}
                onDragLeave={() => setDropHintMs(null)}
                onDrop={onTrackDrop}
                role="slider"
                aria-label="Video-Spur"
                aria-valuemin={0}
                aria-valuemax={totalDurationMs}
                aria-valuenow={cutPlayheadMs}
              >
                {!tracks.v1.hidden
                  ? timeline.map((item) => {
                  const leftPx = timelineLeftPx(item.cutStartMs, msPerPixel)
                  const widthPx = timelineWidthPx(item.durationMs, msPerPixel)
                  const isActive = item.index === activeIndex
                  const clip = clips.find((entry) => entry.scene.id === item.scene.id)
                  const label = clip?.media?.originalFilename ?? `Clip ${item.index + 1}`
                  const thumbMs = item.scene.startMs + Math.floor(item.durationMs / 2)
                  const playbackUrl = clip ? playbackUrlByMediaId[clip.scene.mediaAssetId] ?? null : null
                  const isMoving = dragSceneId === item.scene.id || movePreview?.sceneId === item.scene.id
                  return (
                    <TimelineClip
                      key={item.scene.id}
                      label={label}
                      leftPct={contentWidthPx > 0 ? (leftPx / contentWidthPx) * 100 : 0}
                      widthPct={contentWidthPx > 0 ? (widthPx / contentWidthPx) * 100 : 0}
                      active={isActive}
                      tone="accent"
                      className={`videon-cut-timeline__clip${isMoving ? ' is-dragging' : ''}${isActive ? ' is-active-clip' : ''}${trimPreview?.sceneId === item.scene.id ? ' is-trimming' : ''}`}
                      style={{ pointerEvents: tracks.v1.muted ? 'none' : undefined }}
                      draggable={!disabled && !tracks.v1.muted && !onMoveClip}
                      onDragStart={(event) => onClipDragStart(event, item.scene.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => onClipDrop(item.scene.id)}
                      onPointerDown={(event) => startClipMove(event, item)}
                      onContextMenu={(event) => emitClipContextMenu(event, item)}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (moveRef.current?.armed) return
                        onSelectAudioClip?.(null)
                        onSelectClip(item.index)
                        seekFromPointer(event.clientX)
                      }}
                      title={typeof label === 'string' ? label : undefined}
                    >
                      <TimelineClipThumbnail
                        sourceMs={thumbMs}
                        mediaAssetId={clip?.scene.mediaAssetId}
                        platformProjectId={platformProjectId}
                        playbackUrl={playbackUrl}
                      />
                      <span className="videon-cut-timeline__clip-duration" aria-hidden="true">
                        {formatClock(item.durationMs)}
                      </span>
                      <span
                        className="videon-cut-timeline__clip-handle videon-cut-timeline__clip-handle--start"
                        title={
                          trimMode === 'trim'
                            ? 'Slip: Fenster schieben'
                            : trimMode === 'ripple'
                              ? 'Resize: Startkante (Länge)'
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
                              ? 'Resize: Endkante (Länge)'
                              : 'Roll: gemeinsame Grenze'
                        }
                        onPointerDown={(event) => startTrim(event, item, 'end')}
                        onPointerMove={onTrimPointerMove}
                        onPointerUp={endTrim}
                        onPointerCancel={endTrim}
                      />
                    </TimelineClip>
                  )
                })
                  : null}
                {!tracks.v1.hidden && dropHintLeftPx !== null ? (
                  <div className="videon-cut-timeline__drop-hint" style={{ left: `${dropHintLeftPx}px` }} />
                ) : null}
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--source-audio${tracks.a1.hidden ? ' is-collapsed' : ''}${tracks.a1.muted ? ' is-muted' : ''}`}
                aria-label="Source Audio A1 Voice"
              >
                {!tracks.a1.hidden ? (
                  <TimelineAudioTrack
                    timeline={timeline}
                    totalDurationMs={totalDurationMs}
                    msPerPixel={msPerPixel}
                    peaksByUrl={peaksByUrl}
                    peaksByMediaId={voicePeaksByMediaId}
                    mixPeaksByMediaId={mixPeaksByMediaId}
                    playbackUrlByMediaId={playbackUrlByMediaId}
                    sourceDurationMsByMediaId={sourceDurationMsByMediaId}
                    clips={clips}
                    label="Source Audio · Voice"
                    lazyPeaks
                  />
                ) : null}
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--music videon-cut-timeline__track--source-audio${tracks.a2.hidden ? ' is-collapsed' : ''}${tracks.a2.muted ? ' is-muted' : ''}`}
                aria-label="Source Audio A2 Music"
              >
                {!tracks.a2.hidden ? (
                  <TimelineAudioTrack
                    timeline={timeline}
                    totalDurationMs={totalDurationMs}
                    msPerPixel={msPerPixel}
                    peaksByUrl={{}}
                    peaksByMediaId={musicPeaksByMediaId}
                    playbackUrlByMediaId={playbackUrlByMediaId}
                    sourceDurationMsByMediaId={sourceDurationMsByMediaId}
                    clips={clips}
                    label="Source Audio · Music"
                  />
                ) : null}
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--bus${tracks.ab.hidden ? ' is-collapsed' : ''}${tracks.ab.muted ? ' is-muted' : ''}`}
                onDragOver={onBusDragOver}
                onDrop={onBusDrop}
                aria-label={audioBusLabel}
              >
                {!tracks.ab.hidden
                  ? audioClips.map((clip) => {
                      const duration = Math.max(0, clip.endMs - clip.startMs)
                      const leftPx = timelineLeftPx(clip.timelineStartMs, msPerPixel)
                      const widthPx = timelineWidthPx(duration, msPerPixel, 8)
                      const active = selectedAudioClipId === clip.id
                      return (
                        <TimelineClip
                          key={clip.id}
                          label={clip.label ?? audioBusLabel}
                          leftPct={contentWidthPx > 0 ? (leftPx / contentWidthPx) * 100 : 0}
                          widthPct={contentWidthPx > 0 ? (widthPx / contentWidthPx) * 100 : 0}
                          active={active}
                          tone="accent"
                          className={`videon-cut-timeline__clip videon-cut-timeline__clip--bus${active ? ' is-active-clip' : ''}`}
                          draggable={!disabled && Boolean(onMoveAudioClip)}
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/plain', clip.id)
                            event.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault()
                            if (!onMoveAudioClip || !lanesRef.current) return
                            const cutMs = snapCutMs(
                              Math.floor(
                                Math.min(
                                  Math.max(event.clientX - lanesRef.current.getBoundingClientRect().left, 0),
                                  contentWidthPx,
                                ) * msPerPixel,
                              ),
                              snapPoints,
                            )
                            onMoveAudioClip(clip.id, cutMs)
                          }}
                          onClick={(event) => {
                            event.stopPropagation()
                            onSelectAudioClip?.(clip.id)
                            onSeek(clip.timelineStartMs)
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            onSelectAudioClip?.(clip.id)
                            if (onDeleteAudioClip && !disabled) {
                              // Keep lane menu for VO; delete via inspector/toolbar for now.
                            }
                          }}
                          title={clip.label ?? audioBusLabel}
                        />
                      )
                    })
                  : null}
                {!tracks.ab.hidden && audioClips.length === 0 ? (
                  <Text role="meta" className="videon-cut-timeline__bus-empty">
                    {audioBusLabel} · Media hierher ziehen
                  </Text>
                ) : null}
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--transcript${tracks.tx.hidden ? ' is-collapsed' : ''}${tracks.tx.muted ? ' is-muted' : ''}`}
              >
                {!tracks.tx.hidden
                  ? transcriptSegments.map((segment, index) => {
                  const leftPx = timelineLeftPx(segment.cutStartMs, msPerPixel)
                  const widthPx = timelineWidthPx(segment.cutEndMs - segment.cutStartMs, msPerPixel, 4)
                  return (
                    <TimelineClip
                      key={`${segment.cutStartMs}-${index}`}
                      label={timelineClipLabel(segment.text, 28)}
                      leftPct={contentWidthPx > 0 ? (leftPx / contentWidthPx) * 100 : 0}
                      widthPct={contentWidthPx > 0 ? (widthPx / contentWidthPx) * 100 : 0}
                      active={activeTxIndex === index}
                      tone="transcript"
                      className="videon-cut-timeline__transcript-segment"
                      role="button"
                      tabIndex={tracks.tx.muted ? -1 : 0}
                      onClick={() => {
                        if (!tracks.tx.muted) onSeek(segment.cutStartMs)
                      }}
                      title={segment.text}
                    />
                  )
                })
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
