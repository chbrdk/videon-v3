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
import { resolveVideoLaneDrop } from '@/lib/cut-lane-drop'
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

export type CutTimelineVideoClip = {
  id: string
  trackId: string
  mediaAssetId: string
  position: number
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
  v2TranscriptSegments?: CutTranscriptSegment[]
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
  videoClips?: CutTimelineVideoClip[]
  audioBusLabel?: string
  audioBusMuted?: boolean
  videoOverlayMuted?: boolean
  selectedAudioClipId?: string | null
  selectedVideoClipId?: string | null
  onSelectClip: (index: number) => void
  onSeek: (cutMs: number) => void
  onReorder: (sceneIds: string[]) => void
  onMoveClip?: (sceneId: string, timelineStartMs: number) => void
  onMoveClipLane?: (input: {
    fromLane: 'v1' | 'v2'
    toLane: 'v1' | 'v2'
    clipId: string
    timelineStartMs: number
  }) => void
  onTrim: (sceneId: string, startMs: number, endMs: number, timelineStartMs?: number) => void
  onRollTrim?: (leftSceneId: string, boundaryMs: number) => void
  onDropMedia?: (payload: MediaDragPayload & { afterSceneId?: string | null; timelineStartMs?: number }) => void
  onDropVideoOverlay?: (payload: MediaDragPayload & { timelineStartMs: number }) => void
  onDropAudioBus?: (payload: MediaDragPayload & { timelineStartMs: number }) => void
  onSelectAudioClip?: (clipId: string | null) => void
  onSelectVideoClip?: (clipId: string | null) => void
  onMoveAudioClip?: (clipId: string, timelineStartMs: number) => void
  onMoveVideoClip?: (clipId: string, timelineStartMs: number) => void
  onTrimVideoClip?: (clipId: string, startMs: number, endMs: number, timelineStartMs?: number) => void
  onDeleteAudioClip?: (clipId: string) => void
  onDeleteVideoClip?: (clipId: string) => void
  onToggleAudioBusMuted?: () => void
  onToggleVideoOverlayMuted?: () => void
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
  v2TranscriptSegments = [],
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
  videoClips = [],
  audioBusLabel = 'Voice-Over',
  audioBusMuted = false,
  videoOverlayMuted = false,
  selectedAudioClipId = null,
  selectedVideoClipId = null,
  onSelectClip,
  onSeek,
  onReorder,
  onMoveClip,
  onMoveClipLane,
  onTrim,
  onRollTrim,
  onDropMedia,
  onDropVideoOverlay,
  onDropAudioBus,
  onSelectAudioClip,
  onSelectVideoClip,
  onMoveAudioClip,
  onMoveVideoClip,
  onTrimVideoClip,
  onDeleteAudioClip,
  onDeleteVideoClip,
  onToggleAudioBusMuted,
  onToggleVideoOverlayMuted,
  onContextMenuRequest,
  onTrackMutesChange,
  hasStemAudio = false,
}: CutTimelineProps) {
  const videoTrackRef = useRef<HTMLDivElement | null>(null)
  const videoOverlayTrackRef = useRef<HTMLDivElement | null>(null)
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
  const [laneDropTarget, setLaneDropTarget] = useState<'v1' | 'v2' | null>(null)
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
    previewStartMs: number
    previewEndMs: number
    previewTimelineStartMs: number
    previewRollBoundaryMs?: number
  } | null>(null)
  const moveRef = useRef<{
    sceneId: string
    originTimelineStartMs: number
    pointerStartX: number
    pointerStartY: number
    lastClientY: number
    armed: boolean
    previewStartMs: number
  } | null>(null)
  const moveListenersRef = useRef<{
    onMove: (e: PointerEvent) => void
    onUp: (e: PointerEvent) => void
  } | null>(null)
  const trimListenersRef = useRef<{ onMove: (e: PointerEvent) => void; onUp: () => void } | null>(null)

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
    setTracks((current) =>
      current.v2.muted === videoOverlayMuted
        ? current
        : { ...current, v2: { ...current.v2, muted: videoOverlayMuted } },
    )
  }, [videoOverlayMuted])

  useEffect(() => {
    onTrackMutesChange?.({
      v1: tracks.v1.muted,
      v2: tracks.v2.muted,
      a1: tracks.a1.muted,
      a2: tracks.a2.muted,
      v2a1: tracks.v2a1.muted,
      v2a2: tracks.v2a2.muted,
      ab: tracks.ab.muted,
    })
  }, [
    tracks.v1.muted,
    tracks.v2.muted,
    tracks.a1.muted,
    tracks.a2.muted,
    tracks.v2a1.muted,
    tracks.v2a2.muted,
    tracks.ab.muted,
    onTrackMutesChange,
  ])

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
    if (disabled || (!onMoveClip && !onMoveClipLane)) return
    if ((event.target as HTMLElement).closest('.videon-cut-timeline__clip-handle')) return
    event.stopPropagation()
    event.preventDefault()
    // Clear any previous gesture listeners.
    if (moveListenersRef.current) {
      window.removeEventListener('pointermove', moveListenersRef.current.onMove)
      window.removeEventListener('pointerup', moveListenersRef.current.onUp)
      window.removeEventListener('pointercancel', moveListenersRef.current.onUp)
      moveListenersRef.current = null
    }
    const origin = {
      sceneId: item.scene.id,
      originTimelineStartMs: item.cutStartMs,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      lastClientY: event.clientY,
      armed: false,
      previewStartMs: item.cutStartMs,
    }
    moveRef.current = origin
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }

    const readLane = (clientY: number) =>
      resolveVideoLaneDrop({
        clientY,
        v1: videoTrackRef.current?.getBoundingClientRect() ?? null,
        v2: videoOverlayTrackRef.current?.getBoundingClientRect() ?? null,
      })

    const onMove = (moveEvent: PointerEvent) => {
      const current = moveRef.current
      if (!current || current.sceneId !== origin.sceneId) return
      const deltaPx = moveEvent.clientX - current.pointerStartX
      const deltaPy = moveEvent.clientY - current.pointerStartY
      if (!current.armed && Math.abs(deltaPx) < 4 && Math.abs(deltaPy) < 4) return
      current.armed = true
      current.lastClientY = moveEvent.clientY
      setDragSceneId(current.sceneId)
      const nextStart = Math.max(
        0,
        snapCutMs(current.originTimelineStartMs + Math.round(deltaPx * msPerPixel), snapPoints),
      )
      current.previewStartMs = nextStart
      setMovePreview({ sceneId: current.sceneId, timelineStartMs: nextStart })
      const lane = readLane(moveEvent.clientY)
      setLaneDropTarget(lane === 'v2' && clips.length > 1 ? 'v2' : lane === 'v1' ? 'v1' : null)
    }
    const finish = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      moveListenersRef.current = null
      const current = moveRef.current
      moveRef.current = null
      setDragSceneId(null)
      setMovePreview(null)
      setLaneDropTarget(null)
      if (!current?.armed) return
      const clientY = typeof upEvent.clientY === 'number' ? upEvent.clientY : current.lastClientY
      const targetLane = readLane(clientY)
      if (targetLane === 'v2' && onMoveClipLane) {
        if (clips.length <= 1) return
        onMoveClipLane({
          fromLane: 'v1',
          toLane: 'v2',
          clipId: current.sceneId,
          timelineStartMs: current.previewStartMs,
        })
        return
      }
      if (!onMoveClip) return
      if (current.previewStartMs === current.originTimelineStartMs) return
      onMoveClip(current.sceneId, current.previewStartMs)
    }
    moveListenersRef.current = { onMove, onUp: finish }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const hasMediaDragType = (types: DOMStringList | readonly string[]) => {
    const list = Array.from(types as ArrayLike<string>)
    return list.includes(MEDIA_DRAG_TYPE) || list.some((type) => type.toLowerCase().includes('videon.media'))
  }

  const onTrackDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !onDropMedia) return
    if (!hasMediaDragType(event.dataTransfer.types)) return
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
    const raw = event.dataTransfer.getData(MEDIA_DRAG_TYPE) || event.dataTransfer.getData('text/plain')
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
    const types = Array.from(event.dataTransfer.types as ArrayLike<string>)
    if (
      !hasMediaDragType(types) &&
      !types.includes(AUDIO_BUS_DRAG_TYPE) &&
      !types.some((type) => type.toLowerCase().includes('videon.audio-bus'))
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
      event.dataTransfer.getData(AUDIO_BUS_DRAG_TYPE) ||
      event.dataTransfer.getData(MEDIA_DRAG_TYPE) ||
      event.dataTransfer.getData('text/plain')
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
    event.preventDefault()
    if (disabled) return
    const clipElement = event.currentTarget.closest('.videon-cut-timeline__clip')
    if (!clipElement) return
    if (trimListenersRef.current) {
      window.removeEventListener('pointermove', trimListenersRef.current.onMove)
      window.removeEventListener('pointerup', trimListenersRef.current.onUp)
      trimListenersRef.current = null
    }
    const nextByTime = timeline.find(
      (entry) =>
        entry.scene.id !== item.scene.id && Math.abs(entry.cutStartMs - item.cutEndMs) < 2,
    )
    const nextClip = nextByTime
      ? clips.find((clip) => clip.scene.id === nextByTime.scene.id)
      : undefined
    const sameMedia = nextClip?.scene.mediaAssetId === item.scene.mediaAssetId
    const mediaDurationMs =
      sourceDurationMsByMediaId[item.scene.mediaAssetId] ?? Math.max(item.scene.endMs, item.durationMs)
    // Edge resize defaults to duration change even if toolbar mode is Slip.
    const mode = trimMode === 'roll' ? 'roll' : 'ripple'
    trimRef.current = {
      sceneId: item.scene.id,
      edge,
      startMs: item.scene.startMs,
      endMs: item.scene.endMs,
      timelineStartMs: item.cutStartMs,
      pointerStartX: event.clientX,
      clipWidthPx: Math.max(clipElement.getBoundingClientRect().width, 1),
      mediaDurationMs,
      nextClip: nextClip
        ? { startMs: nextClip.scene.startMs, endMs: nextClip.scene.endMs, sameMedia: Boolean(sameMedia) }
        : undefined,
      previewStartMs: item.scene.startMs,
      previewEndMs: item.scene.endMs,
      previewTimelineStartMs: item.cutStartMs,
    }

    const onMove = (moveEvent: PointerEvent) => {
      const trim = trimRef.current
      if (!trim || trim.sceneId !== item.scene.id) return
      const deltaPx = moveEvent.clientX - trim.pointerStartX
      const sourceDelta = Math.round(deltaPx * msPerPixel)
      const preview = computeTrimPreview({
        mode,
        edge: trim.edge,
        startMs: trim.startMs,
        endMs: trim.endMs,
        sourceDelta,
        mediaDurationMs: trim.mediaDurationMs,
        nextClip: trim.nextClip ?? null,
      })
      if (!preview) return
      const timelineStartMs =
        trim.edge === 'start'
          ? Math.max(0, trim.timelineStartMs + (preview.startMs - trim.startMs))
          : trim.timelineStartMs
      trim.previewStartMs = preview.startMs
      trim.previewEndMs = preview.endMs
      trim.previewTimelineStartMs = timelineStartMs
      trim.previewRollBoundaryMs = preview.rollBoundaryMs
      setTrimPreview({
        sceneId: trim.sceneId,
        startMs: preview.startMs,
        endMs: preview.endMs,
        timelineStartMs,
        rollBoundaryMs: preview.rollBoundaryMs,
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      trimListenersRef.current = null
      const trim = trimRef.current
      trimRef.current = null
      setTrimPreview(null)
      if (!trim) return
      if (trim.previewRollBoundaryMs !== undefined && onRollTrim) {
        if (trim.previewRollBoundaryMs !== trim.endMs) onRollTrim(trim.sceneId, trim.previewRollBoundaryMs)
        return
      }
      if (
        trim.previewStartMs === trim.startMs &&
        trim.previewEndMs === trim.endMs &&
        trim.previewTimelineStartMs === trim.timelineStartMs
      ) {
        return
      }
      onTrim(trim.sceneId, trim.previewStartMs, trim.previewEndMs, trim.previewTimelineStartMs)
    }
    trimListenersRef.current = { onMove, onUp }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const playheadLeftPx = timelineLeftPx(cutPlayheadMs, msPerPixel)
  const dropHintLeftPx = dropHintMs !== null ? timelineLeftPx(dropHintMs, msPerPixel) : null

  const [v2MovePreview, setV2MovePreview] = useState<{ clipId: string; timelineStartMs: number } | null>(null)
  const [v2TrimPreview, setV2TrimPreview] = useState<{
    clipId: string
    startMs: number
    endMs: number
    timelineStartMs: number
  } | null>(null)
  const v2MoveRef = useRef<{
    clipId: string
    originTimelineStartMs: number
    pointerStartX: number
    pointerStartY: number
    lastClientY: number
    armed: boolean
    previewStartMs: number
  } | null>(null)
  const v2TrimRef = useRef<{
    clipId: string
    edge: 'start' | 'end'
    startMs: number
    endMs: number
    timelineStartMs: number
    pointerStartX: number
    mediaDurationMs: number
    previewStartMs: number
    previewEndMs: number
    previewTimelineStartMs: number
  } | null>(null)

  const visibleVideoClips = useMemo(() => {
    return videoClips.map((clip) => {
      const trimming = v2TrimPreview?.clipId === clip.id
      const moving = v2MovePreview?.clipId === clip.id
      return {
        ...clip,
        startMs: trimming ? v2TrimPreview.startMs : clip.startMs,
        endMs: trimming ? v2TrimPreview.endMs : clip.endMs,
        timelineStartMs: trimming
          ? v2TrimPreview.timelineStartMs
          : moving
            ? v2MovePreview.timelineStartMs
            : clip.timelineStartMs,
      }
    })
  }, [videoClips, v2MovePreview, v2TrimPreview])

  const v2Timeline = useMemo(
    () =>
      buildCutTimeline(
        visibleVideoClips.map((clip) => ({
          id: clip.id,
          position: clip.position,
          mediaAssetId: clip.mediaAssetId,
          startMs: clip.startMs,
          endMs: clip.endMs,
          timelineStartMs: clip.timelineStartMs,
        })),
      ),
    [visibleVideoClips],
  )

  const v2AudioClips = useMemo(
    () =>
      v2Timeline.map((item) => ({
        scene: {
          mediaAssetId: item.scene.mediaAssetId,
          startMs: item.scene.startMs,
          endMs: item.scene.endMs,
        },
      })),
    [v2Timeline],
  )

  const onV2TrackDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !onDropVideoOverlay) return
    if (!hasMediaDragType(event.dataTransfer.types)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (lanesRef.current) {
      const rect = lanesRef.current.getBoundingClientRect()
      const maxX = Math.max(contentWidthPx, rect.width)
      const x = Math.min(Math.max(event.clientX - rect.left, 0), maxX)
      setDropHintMs(snapCutMs(Math.floor(x * msPerPixel), snapPoints))
    }
  }

  const onV2TrackDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDropHintMs(null)
    if (disabled || !onDropVideoOverlay) return
    const raw = event.dataTransfer.getData(MEDIA_DRAG_TYPE) || event.dataTransfer.getData('text/plain')
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
          : 0
      onDropVideoOverlay({ ...payload, timelineStartMs: cutMs })
    } catch {
      /* ignore */
    }
  }

  const startV2ClipMove = (event: ReactPointerEvent<HTMLDivElement>, clip: CutTimelineVideoClip) => {
    if (disabled || (!onMoveVideoClip && !onMoveClipLane)) return
    if ((event.target as HTMLElement).closest('.videon-cut-timeline__clip-handle')) return
    event.stopPropagation()
    event.preventDefault()
    const origin = {
      clipId: clip.id,
      originTimelineStartMs: clip.timelineStartMs,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      lastClientY: event.clientY,
      armed: false,
      previewStartMs: clip.timelineStartMs,
    }
    v2MoveRef.current = origin
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }

    const readLane = (clientY: number) =>
      resolveVideoLaneDrop({
        clientY,
        v1: videoTrackRef.current?.getBoundingClientRect() ?? null,
        v2: videoOverlayTrackRef.current?.getBoundingClientRect() ?? null,
      })

    const onMove = (moveEvent: PointerEvent) => {
      const current = v2MoveRef.current
      if (!current || current.clipId !== origin.clipId) return
      const deltaPx = moveEvent.clientX - current.pointerStartX
      const deltaPy = moveEvent.clientY - current.pointerStartY
      if (!current.armed && Math.abs(deltaPx) < 4 && Math.abs(deltaPy) < 4) return
      current.armed = true
      current.lastClientY = moveEvent.clientY
      const nextStart = Math.max(
        0,
        snapCutMs(current.originTimelineStartMs + Math.round(deltaPx * msPerPixel), snapPoints),
      )
      current.previewStartMs = nextStart
      setV2MovePreview({ clipId: current.clipId, timelineStartMs: nextStart })
      setLaneDropTarget(readLane(moveEvent.clientY))
    }
    const finish = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      const current = v2MoveRef.current
      v2MoveRef.current = null
      setV2MovePreview(null)
      setLaneDropTarget(null)
      if (!current?.armed) return
      const clientY = typeof upEvent.clientY === 'number' ? upEvent.clientY : current.lastClientY
      const targetLane = readLane(clientY)
      if (targetLane === 'v1' && onMoveClipLane) {
        onMoveClipLane({
          fromLane: 'v2',
          toLane: 'v1',
          clipId: current.clipId,
          timelineStartMs: current.previewStartMs,
        })
        return
      }
      if (!onMoveVideoClip) return
      if (current.previewStartMs === current.originTimelineStartMs) return
      onMoveVideoClip(current.clipId, current.previewStartMs)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const startV2Trim = (
    event: ReactPointerEvent<HTMLSpanElement>,
    clip: CutTimelineVideoClip,
    edge: 'start' | 'end',
  ) => {
    event.stopPropagation()
    event.preventDefault()
    if (disabled || !onTrimVideoClip) return
    const mediaDurationMs =
      sourceDurationMsByMediaId[clip.mediaAssetId] ?? Math.max(clip.endMs, MIN_CUT_CLIP_MS)
    const trimState = {
      clipId: clip.id,
      edge,
      startMs: clip.startMs,
      endMs: clip.endMs,
      timelineStartMs: clip.timelineStartMs,
      pointerStartX: event.clientX,
      previewStartMs: clip.startMs,
      previewEndMs: clip.endMs,
      previewTimelineStartMs: clip.timelineStartMs,
      mediaDurationMs,
    }
    v2TrimRef.current = trimState
    const onMove = (moveEvent: PointerEvent) => {
      const trim = v2TrimRef.current
      if (!trim || trim.clipId !== clip.id) return
      const deltaMs = Math.round((moveEvent.clientX - trim.pointerStartX) * msPerPixel)
      const preview = computeTrimPreview({
        mode: 'ripple',
        edge: trim.edge,
        startMs: trim.startMs,
        endMs: trim.endMs,
        sourceDelta: deltaMs,
        mediaDurationMs: trim.mediaDurationMs,
        nextClip: null,
      })
      if (!preview) return
      const timelineStartMs =
        trim.edge === 'start'
          ? Math.max(0, trim.timelineStartMs + (preview.startMs - trim.startMs))
          : trim.timelineStartMs
      trim.previewStartMs = preview.startMs
      trim.previewEndMs = preview.endMs
      trim.previewTimelineStartMs = timelineStartMs
      setV2TrimPreview({ clipId: trim.clipId, ...preview, timelineStartMs })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const trim = v2TrimRef.current
      v2TrimRef.current = null
      setV2TrimPreview(null)
      if (!trim || !onTrimVideoClip) return
      if (
        trim.previewStartMs === trim.startMs &&
        trim.previewEndMs === trim.endMs &&
        trim.previewTimelineStartMs === trim.timelineStartMs
      ) {
        return
      }
      onTrimVideoClip(trim.clipId, trim.previewStartMs, trim.previewEndMs, trim.previewTimelineStartMs)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  usePlayheadFollow(viewportRef, playheadLeftPx, !disabled)
  const activeTxIndex = useMemo(
    () =>
      activeTranscriptIndex(
        cutPlayheadMs,
        transcriptSegments.map((segment) => ({ startMs: segment.cutStartMs, endMs: segment.cutEndMs })),
      ),
    [cutPlayheadMs, transcriptSegments],
  )
  const activeV2TxIndex = useMemo(
    () =>
      activeTranscriptIndex(
        cutPlayheadMs,
        v2TranscriptSegments.map((segment) => ({ startMs: segment.cutStartMs, endMs: segment.cutEndMs })),
      ),
    [cutPlayheadMs, v2TranscriptSegments],
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
              id="tx"
              label="TX"
              variant="transcript"
              hidden={tracks.tx.hidden}
              muted={tracks.tx.muted}
              onToggleHidden={() => toggleTrack('tx', 'hidden')}
              onToggleMuted={() => toggleTrack('tx', 'muted')}
              muteHint="Transkript deaktivieren"
            />
            <TimelineTrackHeader
              id="v2"
              label="V2"
              hidden={tracks.v2.hidden}
              muted={tracks.v2.muted}
              onToggleHidden={() => toggleTrack('v2', 'hidden')}
              onToggleMuted={() => {
                toggleTrack('v2', 'muted')
                onToggleVideoOverlayMuted?.()
              }}
              muteHint="Overlay ausblenden (V1 bleibt)"
            />
            <TimelineTrackHeader
              id="v2a1"
              label="V2-A1"
              variant="audio"
              hidden={tracks.v2a1.hidden}
              muted={tracks.v2a1.muted}
              onToggleHidden={() => toggleTrack('v2a1', 'hidden')}
              onToggleMuted={() => toggleTrack('v2a1', 'muted')}
              muteHint="V2 Source Audio Voice"
            />
            <TimelineTrackHeader
              id="v2a2"
              label="V2-A2"
              variant="audio"
              hidden={tracks.v2a2.hidden}
              muted={tracks.v2a2.muted}
              onToggleHidden={() => toggleTrack('v2a2', 'hidden')}
              onToggleMuted={() => toggleTrack('v2a2', 'muted')}
              muteHint="V2 Source Audio Music"
            />
            <TimelineTrackHeader
              id="v2tx"
              label="V2-TX"
              variant="transcript"
              hidden={tracks.v2tx.hidden}
              muted={tracks.v2tx.muted}
              onToggleHidden={() => toggleTrack('v2tx', 'hidden')}
              onToggleMuted={() => toggleTrack('v2tx', 'muted')}
              muteHint="V2 Transkript deaktivieren"
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
                className={`videon-cut-timeline__track videon-cut-timeline__track--video${tracks.v1.hidden ? ' is-collapsed' : ''}${tracks.v1.muted ? ' is-muted' : ''}${laneDropTarget === 'v1' ? ' is-lane-drop-target' : ''}`}
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
                      draggable={false}
                      onDragStart={(event) => onClipDragStart(event, item.scene.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => onClipDrop(item.scene.id)}
                      onPointerDown={(event) => startClipMove(event, item)}
                      onContextMenu={(event) => emitClipContextMenu(event, item)}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (moveRef.current?.armed) return
                        onSelectAudioClip?.(null)
                        onSelectVideoClip?.(null)
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
                        title="Resize: Startkante (Länge)"
                        onPointerDown={(event) => startTrim(event, item, 'start')}
                      />
                      <span
                        className="videon-cut-timeline__clip-handle videon-cut-timeline__clip-handle--end"
                        title="Resize: Endkante (Länge)"
                        onPointerDown={(event) => startTrim(event, item, 'end')}
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
                ref={videoOverlayTrackRef}
                className={`videon-cut-timeline__track videon-cut-timeline__track--video videon-cut-timeline__track--v2${tracks.v2.hidden ? ' is-collapsed' : ''}${tracks.v2.muted ? ' is-muted' : ''}${laneDropTarget === 'v2' ? ' is-lane-drop-target' : ''}`}
                onPointerDown={onTrackPointerDown}
                onDragOver={onV2TrackDragOver}
                onDragLeave={() => setDropHintMs(null)}
                onDrop={onV2TrackDrop}
                role="slider"
                aria-label="Video-Overlay V2"
                aria-valuemin={0}
                aria-valuemax={totalDurationMs}
                aria-valuenow={cutPlayheadMs}
              >
                {!tracks.v2.hidden
                  ? visibleVideoClips.map((clip) => {
                      const durationMs = Math.max(0, clip.endMs - clip.startMs)
                      const leftPx = timelineLeftPx(clip.timelineStartMs, msPerPixel)
                      const widthPx = timelineWidthPx(durationMs, msPerPixel)
                      const isActive = selectedVideoClipId === clip.id
                      const thumbMs = clip.startMs + Math.floor(durationMs / 2)
                      const playbackUrl = playbackUrlByMediaId[clip.mediaAssetId] ?? null
                      const label = clip.label ?? `V2`
                      return (
                        <TimelineClip
                          key={clip.id}
                          label={label}
                          leftPct={contentWidthPx > 0 ? (leftPx / contentWidthPx) * 100 : 0}
                          widthPct={contentWidthPx > 0 ? (widthPx / contentWidthPx) * 100 : 0}
                          active={isActive}
                          tone="accent"
                          className={`videon-cut-timeline__clip videon-cut-timeline__clip--v2${isActive ? ' is-active-clip' : ''}${v2MovePreview?.clipId === clip.id ? ' is-dragging' : ''}`}
                          draggable={false}
                          onPointerDown={(event) => startV2ClipMove(event, clip)}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (v2MoveRef.current?.armed) return
                            onSelectAudioClip?.(null)
                            onSelectVideoClip?.(clip.id)
                            seekFromPointer(event.clientX)
                          }}
                          title={label}
                        >
                          <TimelineClipThumbnail
                            sourceMs={thumbMs}
                            mediaAssetId={clip.mediaAssetId}
                            platformProjectId={platformProjectId}
                            playbackUrl={playbackUrl}
                          />
                          <span className="videon-cut-timeline__clip-duration" aria-hidden="true">
                            {formatClock(durationMs)}
                          </span>
                          <span
                            className="videon-cut-timeline__clip-handle videon-cut-timeline__clip-handle--start"
                            title="Resize: Startkante"
                            onPointerDown={(event) => startV2Trim(event, clip, 'start')}
                          />
                          <span
                            className="videon-cut-timeline__clip-handle videon-cut-timeline__clip-handle--end"
                            title="Resize: Endkante"
                            onPointerDown={(event) => startV2Trim(event, clip, 'end')}
                          />
                        </TimelineClip>
                      )
                    })
                  : null}
                {!tracks.v2.hidden && dropHintLeftPx !== null ? (
                  <div className="videon-cut-timeline__drop-hint" style={{ left: `${dropHintLeftPx}px` }} />
                ) : null}
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--source-audio${tracks.v2a1.hidden ? ' is-collapsed' : ''}${tracks.v2a1.muted ? ' is-muted' : ''}`}
                aria-label="V2 Source Audio A1 Voice"
              >
                {!tracks.v2a1.hidden ? (
                  <TimelineAudioTrack
                    timeline={v2Timeline}
                    totalDurationMs={totalDurationMs}
                    msPerPixel={msPerPixel}
                    peaksByUrl={peaksByUrl}
                    peaksByMediaId={voicePeaksByMediaId}
                    mixPeaksByMediaId={mixPeaksByMediaId}
                    playbackUrlByMediaId={playbackUrlByMediaId}
                    sourceDurationMsByMediaId={sourceDurationMsByMediaId}
                    clips={v2AudioClips}
                    label="V2 Source Audio · Voice"
                    lazyPeaks
                  />
                ) : null}
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--music videon-cut-timeline__track--source-audio${tracks.v2a2.hidden ? ' is-collapsed' : ''}${tracks.v2a2.muted ? ' is-muted' : ''}`}
                aria-label="V2 Source Audio A2 Music"
              >
                {!tracks.v2a2.hidden ? (
                  <TimelineAudioTrack
                    timeline={v2Timeline}
                    totalDurationMs={totalDurationMs}
                    msPerPixel={msPerPixel}
                    peaksByUrl={{}}
                    peaksByMediaId={musicPeaksByMediaId}
                    playbackUrlByMediaId={playbackUrlByMediaId}
                    sourceDurationMsByMediaId={sourceDurationMsByMediaId}
                    clips={v2AudioClips}
                    label="V2 Source Audio · Music"
                  />
                ) : null}
              </div>

              <div
                className={`videon-cut-timeline__track videon-cut-timeline__track--transcript videon-cut-timeline__track--v2-tx${tracks.v2tx.hidden ? ' is-collapsed' : ''}${tracks.v2tx.muted ? ' is-muted' : ''}`}
              >
                {!tracks.v2tx.hidden
                  ? v2TranscriptSegments.map((segment, index) => {
                  const leftPx = timelineLeftPx(segment.cutStartMs, msPerPixel)
                  const widthPx = timelineWidthPx(segment.cutEndMs - segment.cutStartMs, msPerPixel, 4)
                  return (
                    <TimelineClip
                      key={`v2-${segment.cutStartMs}-${index}`}
                      label={timelineClipLabel(segment.text, 28)}
                      leftPct={contentWidthPx > 0 ? (leftPx / contentWidthPx) * 100 : 0}
                      widthPct={contentWidthPx > 0 ? (widthPx / contentWidthPx) * 100 : 0}
                      active={activeV2TxIndex === index}
                      tone="transcript"
                      className="videon-cut-timeline__transcript-segment"
                      role="button"
                      tabIndex={tracks.v2tx.muted ? -1 : 0}
                      onClick={() => {
                        if (!tracks.v2tx.muted) onSeek(segment.cutStartMs)
                      }}
                      title={segment.text}
                    />
                  )
                })
                  : null}
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
