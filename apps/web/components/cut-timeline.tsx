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
  scrollLeftToCenterRange,
  timelineContentWidthPx,
  timelineLeftPx,
  timelineMsPerPixel,
  timelineWidthPx,
  zoomIndexToFit,
} from '@/lib/timeline-layout'
import { useTimelineViewportGestures } from '@/lib/use-timeline-viewport-gestures'
import { activeTranscriptIndex, usePlayheadFollow } from '@/lib/use-playhead-follow'
import { computeTrimPreview, TRIM_MODE_HELP, TRIM_MODE_LABELS, type TrimMode } from '@/lib/trim-modes'
import {
  applyCutSnap,
  buildCutSnapPoints,
  nextSnapFilter,
  type SnapFilter,
} from '@/lib/timeline-snap'
import {
  isCutSelected,
  rangeCutSelection,
  toggleCutSelection,
  type CutSelection,
} from '@/lib/cut-timeline-selection'
import { resolveVideoLaneDrop, laneDropHighlight } from '@/lib/cut-lane-drop'
import { armClickSuppress, bindPointerGesture } from '@/lib/cut-pointer-gesture'
import type { CutTimelineContextMenuRequest } from '@/lib/cut-timeline-context-menu'
import { CutTimelineMinimap } from '@/components/cut-timeline-minimap'
import { expandGroupMoveWithRipple } from '@/lib/timeline-ripple'
import { beginLaneMarquee } from '@/lib/timeline-marquee'
import { clipIntersectsView, viewportTimeRange } from '@/lib/timeline-viewport-cull'
import type { TimelineZoomAnchor } from '@/lib/use-timeline-viewport-gestures'

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

export type CutTimelineViewportApi = {
  fitAll: () => void
  fitSelection: () => void
  toggleSnap: () => void
  setSnapEnabled: (enabled: boolean) => void
  getSnapEnabled: () => boolean
  getSelectionRange: () => { startMs: number; endMs: number } | null
}

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
  /** Fired when V1→V2 is blocked (e.g. last remaining V1 scene). */
  onLaneMoveBlocked?: (reason: 'last_v1_scene') => void
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
  markInMs?: number | null
  markOutMs?: number | null
  snapEnabled?: boolean
  onSnapEnabledChange?: (enabled: boolean) => void
  selection?: CutSelection[]
  onSelectionChange?: (selected: CutSelection[]) => void
  onViewportApi?: (api: CutTimelineViewportApi) => void
  isPlaying?: boolean
  timelineTool?: 'select' | 'trim'
  rippleEdit?: boolean
  snapFilter?: SnapFilter
  onSnapFilterChange?: (filter: SnapFilter) => void
  zoomAnchor?: TimelineZoomAnchor
  lockedIds?: string[]
  linkAudio?: boolean
  onMoveClips?: (
    moves: Array<{ lane: 'v1' | 'v2' | 'audio'; id: string; timelineStartMs: number }>,
  ) => void
  onTrimAudioClip?: (
    clipId: string,
    startMs: number,
    endMs: number,
    timelineStartMs?: number,
  ) => void
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
  onLaneMoveBlocked,
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
  markInMs = null,
  markOutMs = null,
  snapEnabled: snapEnabledProp,
  onSnapEnabledChange,
  selection: selectionProp,
  onSelectionChange,
  onViewportApi,
  isPlaying = false,
  timelineTool = 'select',
  rippleEdit = false,
  snapFilter: snapFilterProp,
  onSnapFilterChange,
  zoomAnchor = 'cursor',
  lockedIds = [],
  linkAudio = false,
  onMoveClips,
  onTrimAudioClip,
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
  const [snapGuideMs, setSnapGuideMs] = useState<number | null>(null)
  const [snapEnabledInternal, setSnapEnabledInternal] = useState(true)
  const snapEnabled = snapEnabledProp ?? snapEnabledInternal
  const setSnapEnabled = (enabled: boolean) => {
    if (snapEnabledProp === undefined) setSnapEnabledInternal(enabled)
    onSnapEnabledChange?.(enabled)
  }
  const [selectionInternal, setSelectionInternal] = useState<CutSelection[]>([])
  const selection = selectionProp ?? selectionInternal
  const setSelection = (next: CutSelection[]) => {
    if (selectionProp === undefined) setSelectionInternal(next)
    onSelectionChange?.(next)
  }
  const [groupDeltaMs, setGroupDeltaMs] = useState<number | null>(null)
  const [groupMoveLane, setGroupMoveLane] = useState<'v1' | 'v2' | null>(null)
  const selectionAnchorRef = useRef<CutSelection | null>(null)
  const [snapFilterInternal, setSnapFilterInternal] = useState<SnapFilter>('all')
  const snapFilter = snapFilterProp ?? snapFilterInternal
  const setSnapFilter = (filter: SnapFilter) => {
    if (snapFilterProp === undefined) setSnapFilterInternal(filter)
    onSnapFilterChange?.(filter)
  }
  const lockedSet = useMemo(() => new Set(lockedIds), [lockedIds])
  const [marquee, setMarquee] = useState<{
    lane: 'v1' | 'v2' | 'audio'
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
  const [viewportScroll, setViewportScroll] = useState({ left: 0, width: 640 })
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
    finished: boolean
    groupIds: string[]
  } | null>(null)
  const moveListenersRef = useRef<(() => void) | null>(null)
  const v2MoveUnbindRef = useRef<(() => void) | null>(null)
  const suppressClickRef = useRef(false)
  const trimListenersRef = useRef<{ onMove: (e: PointerEvent) => void; onUp: () => void } | null>(null)

  useEffect(() => {
    return () => {
      moveListenersRef.current?.()
      moveListenersRef.current = null
      v2MoveUnbindRef.current?.()
      v2MoveUnbindRef.current = null
    }
  }, [])

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
      const inGroup =
        groupMoveLane === 'v1' &&
        groupDeltaMs != null &&
        isCutSelected(selection, 'v1', clip.scene.id)
      const baseTimelineStart = clip.scene.timelineStartMs ?? 0
      let timelineStartMs = baseTimelineStart
      if (trimming && typeof trimPreview.timelineStartMs === 'number') {
        timelineStartMs = trimPreview.timelineStartMs
      } else if (moving) {
        timelineStartMs = movePreview.timelineStartMs
      } else if (inGroup) {
        timelineStartMs = Math.max(0, baseTimelineStart + groupDeltaMs)
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
  }, [clips, trimPreview, movePreview, groupDeltaMs, groupMoveLane, selection])

  const snapPoints = useMemo(() => {
    const v1 = timeline.map((item) => ({ cutStartMs: item.cutStartMs, cutEndMs: item.cutEndMs }))
    const v2 = videoClips.map((clip) => {
      const durationMs = Math.max(0, clip.endMs - clip.startMs)
      return {
        cutStartMs: clip.timelineStartMs,
        cutEndMs: clip.timelineStartMs + durationMs,
      }
    })
    const audio = audioClips.map((clip) => ({
      cutStartMs: clip.timelineStartMs,
      cutEndMs: clip.timelineStartMs + Math.max(0, clip.endMs - clip.startMs),
    }))
    return buildCutSnapPoints({
      v1,
      v2,
      audio,
      playheadMs: cutPlayheadMs,
      sequenceEndMs: totalDurationMs,
      marks: { inMs: markInMs, outMs: markOutMs },
      filter: snapFilter,
    })
  }, [timeline, videoClips, audioClips, cutPlayheadMs, totalDurationMs, markInMs, markOutMs, snapFilter])

  const snapEdit = useCallback(
    (
      rawMs: number,
      exclude?: { lane: 'v1' | 'v2' | 'audio'; id: string } | null,
      excludeIds?: { lane: 'v1' | 'v2' | 'audio'; id: string }[],
    ) => {
      const skip = new Set(
        [exclude, ...(excludeIds ?? [])]
          .filter(Boolean)
          .map((entry) => `${entry!.lane}:${entry!.id}`),
      )
      const v1 = timeline
        .filter((item) => !skip.has(`v1:${item.scene.id}`))
        .map((item) => ({ cutStartMs: item.cutStartMs, cutEndMs: item.cutEndMs }))
      const v2 = videoClips
        .filter((clip) => !skip.has(`v2:${clip.id}`))
        .map((clip) => {
          const durationMs = Math.max(0, clip.endMs - clip.startMs)
          return {
            cutStartMs: clip.timelineStartMs,
            cutEndMs: clip.timelineStartMs + durationMs,
          }
        })
      const audio = audioClips
        .filter((clip) => !skip.has(`audio:${clip.id}`))
        .map((clip) => ({
          cutStartMs: clip.timelineStartMs,
          cutEndMs: clip.timelineStartMs + Math.max(0, clip.endMs - clip.startMs),
        }))
      return applyCutSnap(
        rawMs,
        buildCutSnapPoints({
          v1,
          v2,
          audio,
          playheadMs: cutPlayheadMs,
          sequenceEndMs: totalDurationMs,
          marks: { inMs: markInMs, outMs: markOutMs },
          filter: snapFilter,
        }),
        msPerPixel,
        snapEnabled,
      )
    },
    [audioClips, cutPlayheadMs, markInMs, markOutMs, msPerPixel, snapEnabled, snapFilter, timeline, totalDurationMs, videoClips],
  )

  const seekFromPointer = useCallback(
    (clientX: number, track: HTMLDivElement | null = lanesRef.current) => {
      if (!track || totalDurationMs <= 0) return
      const rect = track.getBoundingClientRect()
      const x = Math.min(Math.max(clientX - rect.left, 0), contentWidthPx)
      const raw = Math.floor(x * msPerPixel)
      const snapped = applyCutSnap(raw, snapPoints, msPerPixel, snapEnabled)
      onSeek(snapped.ms)
    },
    [contentWidthPx, msPerPixel, onSeek, snapEnabled, snapPoints, totalDurationMs],
  )

  const selectionRangeMs = useMemo(() => {
    if (selection.length === 0) return null
    let start = Number.POSITIVE_INFINITY
    let end = 0
    for (const item of selection) {
      if (item.lane === 'v1') {
        const clip = timeline.find((entry) => entry.scene.id === item.id)
        if (!clip) continue
        start = Math.min(start, clip.cutStartMs)
        end = Math.max(end, clip.cutEndMs)
      } else if (item.lane === 'v2') {
        const clip = videoClips.find((entry) => entry.id === item.id)
        if (!clip) continue
        const durationMs = Math.max(0, clip.endMs - clip.startMs)
        start = Math.min(start, clip.timelineStartMs)
        end = Math.max(end, clip.timelineStartMs + durationMs)
      } else {
        const clip = audioClips.find((entry) => entry.id === item.id)
        if (!clip) continue
        const durationMs = Math.max(0, clip.endMs - clip.startMs)
        start = Math.min(start, clip.timelineStartMs)
        end = Math.max(end, clip.timelineStartMs + durationMs)
      }
    }
    if (!Number.isFinite(start) || end <= start) return null
    return { startMs: start, endMs: end }
  }, [audioClips, selection, timeline, videoClips])

  const fitToDuration = useCallback(
    (durationMs: number, range: { startMs: number; endMs: number } | null) => {
      const viewport = viewportRef.current
      const width = viewport?.clientWidth ?? 640
      const nextIndex = zoomIndexToFit(durationMs, width)
      setZoomIndex(nextIndex)
      requestAnimationFrame(() => {
        const el = viewportRef.current
        if (!el || !range) return
        const level = TIMELINE_ZOOM_LEVELS[nextIndex] ?? 1
        const mpp = timelineMsPerPixel(level)
        const contentPx = timelineContentWidthPx(totalDurationMs, level)
        el.scrollLeft = scrollLeftToCenterRange({
          startMs: range.startMs,
          endMs: range.endMs,
          msPerPixel: mpp,
          viewportWidthPx: el.clientWidth,
          contentWidthPx: contentPx,
        })
      })
    },
    [totalDurationMs],
  )

  const fitAll = useCallback(() => {
    fitToDuration(Math.max(totalDurationMs, 1), { startMs: 0, endMs: Math.max(totalDurationMs, 1) })
  }, [fitToDuration, totalDurationMs])

  const fitSelection = useCallback(() => {
    if (selectionRangeMs) {
      fitToDuration(selectionRangeMs.endMs - selectionRangeMs.startMs, selectionRangeMs)
      return
    }
    fitAll()
  }, [fitAll, fitToDuration, selectionRangeMs])

  useEffect(() => {
    onViewportApi?.({
      fitAll,
      fitSelection,
      toggleSnap: () => setSnapEnabled(!snapEnabled),
      setSnapEnabled,
      getSnapEnabled: () => snapEnabled,
      getSelectionRange: () => selectionRangeMs,
    })
  }, [fitAll, fitSelection, onViewportApi, selectionRangeMs, snapEnabled])

  useTimelineViewportGestures({
    viewportRef,
    zoomIndex,
    setZoomIndex,
    zoomLevels: TIMELINE_ZOOM_LEVELS,
    onSeekDelta: (deltaMs) => onSeek(Math.max(0, Math.min(cutPlayheadMs + deltaMs, totalDurationMs))),
    enabled: !disabled,
    zoomAnchor,
    playheadMs: cutPlayheadMs,
    msPerPixel,
  })

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const sync = () => setViewportScroll({ left: el.scrollLeft, width: el.clientWidth })
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      el.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

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
        atMs: applyCutSnap(raw, snapPoints, msPerPixel, snapEnabled).ms,
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

  const clearActiveMoves = () => {
    moveListenersRef.current?.()
    moveListenersRef.current = null
    v2MoveUnbindRef.current?.()
    v2MoveUnbindRef.current = null
    moveRef.current = null
    v2MoveRef.current = null
    setDragSceneId(null)
    setMovePreview(null)
    setV2MovePreview(null)
    setLaneDropTarget(null)
    setSnapGuideMs(null)
    setGroupDeltaMs(null)
    setGroupMoveLane(null)
  }

  const startClipMove = (event: ReactPointerEvent<HTMLDivElement>, item: CutTimelineItem) => {
    if (disabled || (!onMoveClip && !onMoveClipLane && !onMoveClips)) return
    if (timelineTool === 'trim') return
    if (lockedSet.has(item.scene.id)) return
    if ((event.target as HTMLElement).closest('.videon-cut-timeline__clip-handle')) return
    event.stopPropagation()
    event.preventDefault()
    clearActiveMoves()

    const primary: CutSelection = { lane: 'v1', id: item.scene.id }
    const movingSet =
      isCutSelected(selection, 'v1', item.scene.id) && selection.filter((entry) => entry.lane === 'v1').length > 1
        ? selection.filter((entry) => entry.lane === 'v1')
        : [primary]
    const excludeIds = movingSet.map((entry) => ({ lane: 'v1' as const, id: entry.id }))

    const origin = {
      sceneId: item.scene.id,
      originTimelineStartMs: item.cutStartMs,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      lastClientY: event.clientY,
      armed: false,
      previewStartMs: item.cutStartMs,
      finished: false,
      groupIds: movingSet.map((entry) => entry.id),
    }
    moveRef.current = origin

    const readLane = (clientY: number) =>
      resolveVideoLaneDrop({
        clientY,
        v1: videoTrackRef.current?.getBoundingClientRect() ?? null,
        v2: videoOverlayTrackRef.current?.getBoundingClientRect() ?? null,
      })

    const onMove = (moveEvent: PointerEvent) => {
      const current = moveRef.current
      if (!current || current.sceneId !== origin.sceneId || current.finished) return
      const deltaPx = moveEvent.clientX - current.pointerStartX
      const deltaPy = moveEvent.clientY - current.pointerStartY
      if (!current.armed && Math.abs(deltaPx) < 4 && Math.abs(deltaPy) < 4) return
      current.armed = true
      current.lastClientY = moveEvent.clientY
      setDragSceneId(current.sceneId)
      const rawStart = Math.max(
        0,
        current.originTimelineStartMs + Math.round(deltaPx * msPerPixel),
      )
      const snapped = snapEdit(rawStart, { lane: 'v1', id: current.sceneId }, excludeIds)
      const deltaMs = snapped.ms - current.originTimelineStartMs
      current.previewStartMs = snapped.ms
      setMovePreview({ sceneId: current.sceneId, timelineStartMs: snapped.ms })
      if (current.groupIds.length > 1) {
        setGroupMoveLane('v1')
        setGroupDeltaMs(deltaMs)
      } else {
        setGroupMoveLane(null)
        setGroupDeltaMs(null)
      }
      setSnapGuideMs(snapped.guideMs)
      setLaneDropTarget(
        laneDropHighlight({
          fromLane: 'v1',
          targetLane: readLane(moveEvent.clientY),
          canMoveToV2: clips.length > 1,
        }),
      )
    }
    const finish = (upEvent: PointerEvent) => {
      moveListenersRef.current = null
      const current = moveRef.current
      if (!current || current.finished) return
      current.finished = true
      moveRef.current = null
      setDragSceneId(null)
      setMovePreview(null)
      setLaneDropTarget(null)
      setSnapGuideMs(null)
      const deltaMs = current.previewStartMs - current.originTimelineStartMs
      const groupIds = current.groupIds
      setGroupDeltaMs(null)
      setGroupMoveLane(null)
      if (!current.armed) return
      armClickSuppress(suppressClickRef)
      const clientY = typeof upEvent.clientY === 'number' ? upEvent.clientY : current.lastClientY
      const targetLane = readLane(clientY)
      if (targetLane === 'v2' && onMoveClipLane) {
        if (clips.length <= 1) {
          onLaneMoveBlocked?.('last_v1_scene')
          return
        }
        // Group lane-hop is out of scope — move primary only.
        onMoveClipLane({
          fromLane: 'v1',
          toLane: 'v2',
          clipId: current.sceneId,
          timelineStartMs: current.previewStartMs,
        })
        return
      }
      if (deltaMs === 0) return
      const laneClips = timeline.map((entry) => ({
        id: entry.scene.id,
        timelineStartMs: entry.cutStartMs,
        durationMs: entry.durationMs,
      }))
      const group = groupIds.map((sceneId) => {
        const clip = clips.find((entry) => entry.scene.id === sceneId)
        const origin = clip?.scene.timelineStartMs ?? 0
        return { id: sceneId, originStartMs: origin, newStartMs: Math.max(0, origin + deltaMs) }
      })
      const expanded = rippleEdit
        ? expandGroupMoveWithRipple(laneClips, group)
        : group.map((item) => ({ id: item.id, timelineStartMs: item.newStartMs }))
      if (onMoveClips && expanded.length > 0) {
        onMoveClips(expanded.map((move) => ({ lane: 'v1' as const, id: move.id, timelineStartMs: move.timelineStartMs })))
        return
      }
      if (!onMoveClip) return
      for (const move of expanded) onMoveClip(move.id, move.timelineStartMs)
    }
    moveListenersRef.current = bindPointerGesture({ onMove, onUp: finish })
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
      setDropHintMs(applyCutSnap(Math.floor(x * msPerPixel), snapPoints, msPerPixel, snapEnabled).ms)
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
          ? applyCutSnap(
              Math.floor(Math.min(Math.max(event.clientX - rect.left, 0), maxX) * msPerPixel),
              snapPoints,
              msPerPixel,
              snapEnabled,
            ).ms
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
          ? applyCutSnap(
              Math.floor(
                Math.min(Math.max(event.clientX - lanesRef.current.getBoundingClientRect().left, 0), contentWidthPx) *
                  msPerPixel,
              ),
              snapPoints,
              msPerPixel,
              snapEnabled,
            ).ms
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
    if (lockedSet.has(item.scene.id)) return
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
    // Slip (trim) keeps timeline duration; Resize/Roll change edges as before.
    const mode = trimMode
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
      let startMs = preview.startMs
      let endMs = preview.endMs
      let timelineStartMs = trim.timelineStartMs
      if (mode === 'trim') {
        // Slip: timeline placement stays fixed.
        setSnapGuideMs(null)
      } else if (trim.edge === 'start') {
        timelineStartMs = Math.max(0, trim.timelineStartMs + (preview.startMs - trim.startMs))
        const snapped = snapEdit(timelineStartMs, { lane: 'v1', id: item.scene.id })
        const adjust = snapped.ms - timelineStartMs
        if (endMs - (startMs + adjust) >= MIN_CUT_CLIP_MS) {
          timelineStartMs = snapped.ms
          startMs += adjust
          setSnapGuideMs(snapped.guideMs)
        } else {
          setSnapGuideMs(null)
        }
      } else {
        timelineStartMs = trim.timelineStartMs
        const timelineEndMs = timelineStartMs + (endMs - startMs)
        const snapped = snapEdit(timelineEndMs, { lane: 'v1', id: item.scene.id })
        const adjust = snapped.ms - timelineEndMs
        if (endMs + adjust - startMs >= MIN_CUT_CLIP_MS) {
          endMs += adjust
          setSnapGuideMs(snapped.guideMs)
        } else {
          setSnapGuideMs(null)
        }
      }
      trim.previewStartMs = startMs
      trim.previewEndMs = endMs
      trim.previewTimelineStartMs = timelineStartMs
      trim.previewRollBoundaryMs = preview.rollBoundaryMs
      setTrimPreview({
        sceneId: trim.sceneId,
        startMs,
        endMs,
        timelineStartMs,
        rollBoundaryMs: preview.rollBoundaryMs,
      })
      const edgeCutMs = trim.edge === 'start' ? timelineStartMs : timelineStartMs + (endMs - startMs)
      onSeek(Math.max(0, Math.min(edgeCutMs, totalDurationMs)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      trimListenersRef.current = null
      const trim = trimRef.current
      trimRef.current = null
      setTrimPreview(null)
      setSnapGuideMs(null)
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
    finished: boolean
    groupIds: string[]
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
      const inGroup =
        groupMoveLane === 'v2' && groupDeltaMs != null && isCutSelected(selection, 'v2', clip.id)
      let timelineStartMs = clip.timelineStartMs
      if (trimming) timelineStartMs = v2TrimPreview.timelineStartMs
      else if (moving) timelineStartMs = v2MovePreview.timelineStartMs
      else if (inGroup) timelineStartMs = Math.max(0, clip.timelineStartMs + groupDeltaMs)
      return {
        ...clip,
        startMs: trimming ? v2TrimPreview.startMs : clip.startMs,
        endMs: trimming ? v2TrimPreview.endMs : clip.endMs,
        timelineStartMs,
      }
    })
  }, [videoClips, v2MovePreview, v2TrimPreview, groupDeltaMs, groupMoveLane, selection])

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
      setDropHintMs(applyCutSnap(Math.floor(x * msPerPixel), snapPoints, msPerPixel, snapEnabled).ms)
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
          ? applyCutSnap(
              Math.floor(Math.min(Math.max(event.clientX - rect.left, 0), maxX) * msPerPixel),
              snapPoints,
              msPerPixel,
              snapEnabled,
            ).ms
          : 0
      onDropVideoOverlay({ ...payload, timelineStartMs: cutMs })
    } catch {
      /* ignore */
    }
  }

  const startV2ClipMove = (event: ReactPointerEvent<HTMLDivElement>, clip: CutTimelineVideoClip) => {
    if (disabled || (!onMoveVideoClip && !onMoveClipLane && !onMoveClips)) return
    if (timelineTool === 'trim') return
    if (lockedSet.has(clip.id)) return
    if ((event.target as HTMLElement).closest('.videon-cut-timeline__clip-handle')) return
    event.stopPropagation()
    event.preventDefault()
    clearActiveMoves()

    const primary: CutSelection = { lane: 'v2', id: clip.id }
    const movingSet =
      isCutSelected(selection, 'v2', clip.id) && selection.filter((entry) => entry.lane === 'v2').length > 1
        ? selection.filter((entry) => entry.lane === 'v2')
        : [primary]
    const excludeIds = movingSet.map((entry) => ({ lane: 'v2' as const, id: entry.id }))

    const origin = {
      clipId: clip.id,
      originTimelineStartMs: clip.timelineStartMs,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      lastClientY: event.clientY,
      armed: false,
      previewStartMs: clip.timelineStartMs,
      finished: false,
      groupIds: movingSet.map((entry) => entry.id),
    }
    v2MoveRef.current = origin

    const readLane = (clientY: number) =>
      resolveVideoLaneDrop({
        clientY,
        v1: videoTrackRef.current?.getBoundingClientRect() ?? null,
        v2: videoOverlayTrackRef.current?.getBoundingClientRect() ?? null,
      })

    const onMove = (moveEvent: PointerEvent) => {
      const current = v2MoveRef.current
      if (!current || current.clipId !== origin.clipId || current.finished) return
      const deltaPx = moveEvent.clientX - current.pointerStartX
      const deltaPy = moveEvent.clientY - current.pointerStartY
      if (!current.armed && Math.abs(deltaPx) < 4 && Math.abs(deltaPy) < 4) return
      current.armed = true
      current.lastClientY = moveEvent.clientY
      const rawStart = Math.max(
        0,
        current.originTimelineStartMs + Math.round(deltaPx * msPerPixel),
      )
      const snapped = snapEdit(rawStart, { lane: 'v2', id: current.clipId }, excludeIds)
      const deltaMs = snapped.ms - current.originTimelineStartMs
      current.previewStartMs = snapped.ms
      setV2MovePreview({ clipId: current.clipId, timelineStartMs: snapped.ms })
      if (current.groupIds.length > 1) {
        setGroupMoveLane('v2')
        setGroupDeltaMs(deltaMs)
      } else {
        setGroupMoveLane(null)
        setGroupDeltaMs(null)
      }
      setSnapGuideMs(snapped.guideMs)
      setLaneDropTarget(
        laneDropHighlight({
          fromLane: 'v2',
          targetLane: readLane(moveEvent.clientY),
        }),
      )
    }
    const finish = (upEvent: PointerEvent) => {
      v2MoveUnbindRef.current = null
      const current = v2MoveRef.current
      if (!current || current.finished) return
      current.finished = true
      v2MoveRef.current = null
      setV2MovePreview(null)
      setLaneDropTarget(null)
      setSnapGuideMs(null)
      const deltaMs = current.previewStartMs - current.originTimelineStartMs
      const groupIds = current.groupIds
      setGroupDeltaMs(null)
      setGroupMoveLane(null)
      if (!current.armed) return
      armClickSuppress(suppressClickRef)
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
      if (deltaMs === 0) return
      const laneClips = videoClips.map((entry) => ({
        id: entry.id,
        timelineStartMs: entry.timelineStartMs,
        durationMs: Math.max(0, entry.endMs - entry.startMs),
      }))
      const group = groupIds.map((clipId) => {
        const entry = videoClips.find((video) => video.id === clipId)
        const origin = entry?.timelineStartMs ?? 0
        return { id: clipId, originStartMs: origin, newStartMs: Math.max(0, origin + deltaMs) }
      })
      const expanded = rippleEdit
        ? expandGroupMoveWithRipple(laneClips, group)
        : group.map((item) => ({ id: item.id, timelineStartMs: item.newStartMs }))
      if (onMoveClips && expanded.length > 0) {
        onMoveClips(expanded.map((move) => ({ lane: 'v2' as const, id: move.id, timelineStartMs: move.timelineStartMs })))
        return
      }
      if (!onMoveVideoClip) return
      for (const move of expanded) onMoveVideoClip(move.id, move.timelineStartMs)
    }
    v2MoveUnbindRef.current = bindPointerGesture({ onMove, onUp: finish })
  }

  const startV2Trim = (
    event: ReactPointerEvent<HTMLSpanElement>,
    clip: CutTimelineVideoClip,
    edge: 'start' | 'end',
  ) => {
    event.stopPropagation()
    event.preventDefault()
    if (disabled || !onTrimVideoClip) return
    if (lockedSet.has(clip.id)) return
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
    const v2Mode = trimMode === 'trim' ? 'trim' : 'ripple'
    v2TrimRef.current = trimState
    const onMove = (moveEvent: PointerEvent) => {
      const trim = v2TrimRef.current
      if (!trim || trim.clipId !== clip.id) return
      const deltaMs = Math.round((moveEvent.clientX - trim.pointerStartX) * msPerPixel)
      const preview = computeTrimPreview({
        mode: v2Mode,
        edge: trim.edge,
        startMs: trim.startMs,
        endMs: trim.endMs,
        sourceDelta: deltaMs,
        mediaDurationMs: trim.mediaDurationMs,
        nextClip: null,
      })
      if (!preview) return
      let startMs = preview.startMs
      let endMs = preview.endMs
      let timelineStartMs = trim.timelineStartMs
      if (v2Mode === 'trim') {
        setSnapGuideMs(null)
      } else if (trim.edge === 'start') {
        timelineStartMs = Math.max(0, trim.timelineStartMs + (preview.startMs - trim.startMs))
        const snapped = snapEdit(timelineStartMs, { lane: 'v2', id: clip.id })
        const adjust = snapped.ms - timelineStartMs
        if (endMs - (startMs + adjust) >= MIN_CUT_CLIP_MS) {
          timelineStartMs = snapped.ms
          startMs += adjust
          setSnapGuideMs(snapped.guideMs)
        } else {
          setSnapGuideMs(null)
        }
      } else {
        const timelineEndMs = timelineStartMs + (endMs - startMs)
        const snapped = snapEdit(timelineEndMs, { lane: 'v2', id: clip.id })
        const adjust = snapped.ms - timelineEndMs
        if (endMs + adjust - startMs >= MIN_CUT_CLIP_MS) {
          endMs += adjust
          setSnapGuideMs(snapped.guideMs)
        } else {
          setSnapGuideMs(null)
        }
      }
      trim.previewStartMs = startMs
      trim.previewEndMs = endMs
      trim.previewTimelineStartMs = timelineStartMs
      setV2TrimPreview({ clipId: trim.clipId, startMs, endMs, timelineStartMs })
      const edgeCutMs = trim.edge === 'start' ? timelineStartMs : timelineStartMs + (endMs - startMs)
      onSeek(Math.max(0, Math.min(edgeCutMs, totalDurationMs)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const trim = v2TrimRef.current
      v2TrimRef.current = null
      setV2TrimPreview(null)
      setSnapGuideMs(null)
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

  const playheadLeftPx = timelineLeftPx(cutPlayheadMs, msPerPixel)
  const dropHintLeftPx = dropHintMs !== null ? timelineLeftPx(dropHintMs, msPerPixel) : null
  const linkV1Audio = linkAudio && selection.some((item) => item.lane === 'v1')
  const linkV2Audio = linkAudio && selection.some((item) => item.lane === 'v2')

  usePlayheadFollow(viewportRef, playheadLeftPx, !disabled && isPlaying)
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

  const viewRange = useMemo(
    () =>
      viewportTimeRange({
        scrollLeft: viewportScroll.left,
        clientWidth: viewportScroll.width,
        msPerPixel,
      }),
    [msPerPixel, viewportScroll.left, viewportScroll.width],
  )

  const applyClipSelection = (
    event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
    target: CutSelection,
    laneItems: { id: string; cutStartMs: number; cutEndMs: number }[],
  ) => {
    if (event.metaKey || event.ctrlKey) {
      const next = toggleCutSelection(selection, target)
      setSelection(next)
      selectionAnchorRef.current = target
      return next
    }
    if (event.shiftKey) {
      const anchor =
        selectionAnchorRef.current?.lane === target.lane ? selectionAnchorRef.current.id : target.id
      const next = rangeCutSelection(laneItems, anchor, target.id, target.lane)
      setSelection(next)
      return next
    }
    selectionAnchorRef.current = target
    setSelection([target])
    return [target]
  }

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
            label={snapEnabled ? 'Snap aus (N)' : 'Snap an (N)'}
            active={snapEnabled}
            onClick={() => setSnapEnabled(!snapEnabled)}
          >
            Snap
          </ToolButton>
          <ToolButton label="Fit Selection (Z)" onClick={fitSelection}>
            Fit
          </ToolButton>
          <Text role="meta">
            {timelineTool === 'trim' ? 'Trim' : 'Select'}
            {rippleEdit ? ' · Ripple' : ''}
            {linkAudio ? ' · LinkA' : ''}
            {' · '}
            {snapFilter}
          </Text>
          <ToolButton label="Snap-Filter (Shift+N)" onClick={() => setSnapFilter(nextSnapFilter(snapFilter))}>
            {snapFilter}
          </ToolButton>
          <Text role="meta">{zoomAnchor === 'playhead' ? 'Zoom@PH' : 'Zoom@Cursor'}</Text>
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
                onDoubleClick={(event) => {
                  event.preventDefault()
                  fitAll()
                }}
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
                {markInMs != null ? (
                  <div
                    className="videon-cut-timeline__mark videon-cut-timeline__mark--in"
                    style={{ left: `${timelineLeftPx(markInMs, msPerPixel)}px` }}
                    title={`In ${formatClock(markInMs)}`}
                  />
                ) : null}
                {markOutMs != null ? (
                  <div
                    className="videon-cut-timeline__mark videon-cut-timeline__mark--out"
                    style={{ left: `${timelineLeftPx(markOutMs, msPerPixel)}px` }}
                    title={`Out ${formatClock(markOutMs)}`}
                  />
                ) : null}
              </div>

              <div
                ref={videoTrackRef}
                className={`videon-cut-timeline__track videon-cut-timeline__track--video${tracks.v1.hidden ? ' is-collapsed' : ''}${tracks.v1.muted ? ' is-muted' : ''}${laneDropTarget === 'v1' ? ' is-lane-drop-target' : ''}`}
                onPointerDown={(event) => {
                  if ((event.target as HTMLElement).closest('.videon-cut-timeline__clip')) {
                    onTrackPointerDown(event)
                    return
                  }
                  const trackRect = event.currentTarget.getBoundingClientRect()
                  beginLaneMarquee({
                    clientX: event.clientX,
                    clientY: event.clientY,
                    trackRect,
                    lane: 'v1',
                    shiftKey: event.shiftKey,
                    getClipBoxes: (trackHeight) =>
                      timeline.map((item) => {
                        const left = timelineLeftPx(item.cutStartMs, msPerPixel)
                        const width = timelineWidthPx(item.durationMs, msPerPixel)
                        return { id: item.scene.id, left, right: left + width, top: 0, bottom: trackHeight }
                      }),
                    setMarquee,
                    setSelection: (next, additive) => {
                      setSelection(
                        additive
                          ? [...selection, ...next.filter((item) => !isCutSelected(selection, 'v1', item.id))]
                          : next,
                      )
                    },
                    onEmptyClick: () => onTrackPointerDown(event),
                  })
                }}
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
                  ? timeline.filter((item) => clipIntersectsView({ cutStartMs: item.cutStartMs, cutEndMs: item.cutEndMs }, viewRange)).map((item) => {
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
                      className={`videon-cut-timeline__clip${isMoving ? ' is-dragging' : ''}${isActive ? ' is-active-clip' : ''}${isCutSelected(selection, 'v1', item.scene.id) ? ' is-selected' : ''}${lockedSet.has(item.scene.id) ? ' is-locked' : ''}${linkAudio && isCutSelected(selection, 'v1', item.scene.id) ? ' is-link-highlight' : ''}${trimPreview?.sceneId === item.scene.id ? ' is-trimming' : ''}`}
                      draggable={false}
                      onDragStart={(event) => onClipDragStart(event, item.scene.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => onClipDrop(item.scene.id)}
                      onPointerDown={(event) => startClipMove(event, item)}
                      onContextMenu={(event) => emitClipContextMenu(event, item)}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (suppressClickRef.current) return
                        const laneItems = timeline.map((entry) => ({
                          id: entry.scene.id,
                          cutStartMs: entry.cutStartMs,
                          cutEndMs: entry.cutEndMs,
                        }))
                        applyClipSelection(event, { lane: 'v1', id: item.scene.id }, laneItems)
                        onSelectAudioClip?.(null)
                        onSelectVideoClip?.(null)
                        onSelectClip(item.index)
                        if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
                          seekFromPointer(event.clientX)
                        }
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
                className={`videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--source-audio${tracks.a1.hidden ? ' is-collapsed' : ''}${tracks.a1.muted ? ' is-muted' : ''}${linkV1Audio ? ' is-link-highlight' : ''}`}
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
                className={`videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--music videon-cut-timeline__track--source-audio${tracks.a2.hidden ? ' is-collapsed' : ''}${tracks.a2.muted ? ' is-muted' : ''}${linkV1Audio ? ' is-link-highlight' : ''}`}
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
                onPointerDown={(event) => {
                  if ((event.target as HTMLElement).closest('.videon-cut-timeline__clip')) {
                    onTrackPointerDown(event)
                    return
                  }
                  const trackRect = event.currentTarget.getBoundingClientRect()
                  beginLaneMarquee({
                    clientX: event.clientX,
                    clientY: event.clientY,
                    trackRect,
                    lane: 'v2',
                    shiftKey: event.shiftKey,
                    getClipBoxes: (trackHeight) =>
                      visibleVideoClips.map((clip) => {
                        const durationMs = Math.max(0, clip.endMs - clip.startMs)
                        const left = timelineLeftPx(clip.timelineStartMs, msPerPixel)
                        const width = timelineWidthPx(durationMs, msPerPixel)
                        return { id: clip.id, left, right: left + width, top: 0, bottom: trackHeight }
                      }),
                    setMarquee,
                    setSelection: (next, additive) => {
                      setSelection(
                        additive
                          ? [...selection, ...next.filter((item) => !isCutSelected(selection, 'v2', item.id))]
                          : next,
                      )
                    },
                    onEmptyClick: () => onTrackPointerDown(event),
                  })
                }}
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
                          className={`videon-cut-timeline__clip videon-cut-timeline__clip--v2${isActive ? ' is-active-clip' : ''}${isCutSelected(selection, 'v2', clip.id) ? ' is-selected' : ''}${v2MovePreview?.clipId === clip.id ? ' is-dragging' : ''}`}
                          draggable={false}
                          onPointerDown={(event) => startV2ClipMove(event, clip)}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (suppressClickRef.current) return
                            const laneItems = visibleVideoClips.map((entry) => {
                              const durationMs = Math.max(0, entry.endMs - entry.startMs)
                              return {
                                id: entry.id,
                                cutStartMs: entry.timelineStartMs,
                                cutEndMs: entry.timelineStartMs + durationMs,
                              }
                            })
                            applyClipSelection(event, { lane: 'v2', id: clip.id }, laneItems)
                            onSelectAudioClip?.(null)
                            onSelectVideoClip?.(clip.id)
                            if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
                              seekFromPointer(event.clientX)
                            }
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
                className={`videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--source-audio${tracks.v2a1.hidden ? ' is-collapsed' : ''}${tracks.v2a1.muted ? ' is-muted' : ''}${linkV2Audio ? ' is-link-highlight' : ''}`}
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
                className={`videon-cut-timeline__track videon-cut-timeline__track--audio videon-cut-timeline__track--music videon-cut-timeline__track--source-audio${tracks.v2a2.hidden ? ' is-collapsed' : ''}${tracks.v2a2.muted ? ' is-muted' : ''}${linkV2Audio ? ' is-link-highlight' : ''}`}
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
                onPointerDown={(event) => {
                  if ((event.target as HTMLElement).closest('.videon-cut-timeline__clip')) return
                  const trackRect = event.currentTarget.getBoundingClientRect()
                  beginLaneMarquee({
                    clientX: event.clientX,
                    clientY: event.clientY,
                    trackRect,
                    lane: 'audio',
                    shiftKey: event.shiftKey,
                    getClipBoxes: (trackHeight) =>
                      audioClips.map((clip) => {
                        const duration = Math.max(0, clip.endMs - clip.startMs)
                        const left = timelineLeftPx(clip.timelineStartMs, msPerPixel)
                        const width = timelineWidthPx(duration, msPerPixel, 8)
                        return { id: clip.id, left, right: left + width, top: 0, bottom: trackHeight }
                      }),
                    setMarquee,
                    setSelection: (next, additive) => {
                      setSelection(
                        additive
                          ? [
                              ...selection,
                              ...next.filter((item) => !isCutSelected(selection, 'audio', item.id)),
                            ]
                          : next,
                      )
                    },
                    onEmptyClick: () => onTrackPointerDown(event),
                  })
                }}
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
                          className={`videon-cut-timeline__clip videon-cut-timeline__clip--bus${active ? ' is-active-clip' : ''}${isCutSelected(selection, 'audio', clip.id) ? ' is-selected' : ''}${lockedSet.has(clip.id) ? ' is-locked' : ''}`}
                          draggable={!disabled && Boolean(onMoveAudioClip)}
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/plain', clip.id)
                            event.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault()
                            if (!onMoveAudioClip || !lanesRef.current) return
                            const cutMs = applyCutSnap(
                              Math.floor(
                                Math.min(
                                  Math.max(event.clientX - lanesRef.current.getBoundingClientRect().left, 0),
                                  contentWidthPx,
                                ) * msPerPixel,
                              ),
                              snapPoints,
                              msPerPixel,
                              snapEnabled,
                            ).ms
                            onMoveAudioClip(clip.id, cutMs)
                          }}
                          onClick={(event) => {
                            event.stopPropagation()
                            const laneItems = audioClips.map((entry) => ({
                              id: entry.id,
                              cutStartMs: entry.timelineStartMs,
                              cutEndMs: entry.timelineStartMs + Math.max(0, entry.endMs - entry.startMs),
                            }))
                            applyClipSelection(event, { lane: 'audio', id: clip.id }, laneItems)
                            onSelectAudioClip?.(clip.id)
                            if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
                              onSeek(clip.timelineStartMs)
                            }
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
                        >
                          <span
                            className="videon-cut-timeline__clip-handle videon-cut-timeline__clip-handle--start"
                            title="Audio Startkante"
                            onPointerDown={(event) => {
                              event.stopPropagation()
                              if (disabled || !onTrimAudioClip || lockedSet.has(clip.id)) return
                              const origin = {
                                startMs: clip.startMs,
                                endMs: clip.endMs,
                                timelineStartMs: clip.timelineStartMs,
                                pointerX: event.clientX,
                                mediaDurationMs:
                                  sourceDurationMsByMediaId[clip.mediaAssetId] ??
                                  Math.max(clip.endMs, MIN_CUT_CLIP_MS),
                              }
                              const slip = trimMode === 'trim'
                              const onMove = (moveEvent: PointerEvent) => {
                                const delta = Math.round((moveEvent.clientX - origin.pointerX) * msPerPixel)
                                if (slip) {
                                  const preview = computeTrimPreview({
                                    mode: 'trim',
                                    edge: 'start',
                                    startMs: origin.startMs,
                                    endMs: origin.endMs,
                                    sourceDelta: delta,
                                    mediaDurationMs: origin.mediaDurationMs,
                                    nextClip: null,
                                  })
                                  if (!preview) return
                                  setSnapGuideMs(null)
                                  onTrimAudioClip(clip.id, preview.startMs, preview.endMs, origin.timelineStartMs)
                                  return
                                }
                                let timelineStartMs = Math.max(0, origin.timelineStartMs + delta)
                                let startMs = origin.startMs + delta
                                let endMs = origin.endMs
                                const snapped = snapEdit(timelineStartMs, { lane: 'audio', id: clip.id })
                                const adjust = snapped.ms - timelineStartMs
                                timelineStartMs = snapped.ms
                                startMs += adjust
                                if (endMs - startMs < 40) return
                                setSnapGuideMs(snapped.guideMs)
                                onTrimAudioClip(clip.id, startMs, endMs, timelineStartMs)
                              }
                              const onUp = () => {
                                window.removeEventListener('pointermove', onMove)
                                window.removeEventListener('pointerup', onUp)
                                setSnapGuideMs(null)
                              }
                              window.addEventListener('pointermove', onMove)
                              window.addEventListener('pointerup', onUp)
                            }}
                          />
                          <span
                            className="videon-cut-timeline__clip-handle videon-cut-timeline__clip-handle--end"
                            title="Audio Endkante"
                            onPointerDown={(event) => {
                              event.stopPropagation()
                              if (disabled || !onTrimAudioClip || lockedSet.has(clip.id)) return
                              const origin = {
                                startMs: clip.startMs,
                                endMs: clip.endMs,
                                timelineStartMs: clip.timelineStartMs,
                                pointerX: event.clientX,
                                mediaDurationMs:
                                  sourceDurationMsByMediaId[clip.mediaAssetId] ??
                                  Math.max(clip.endMs, MIN_CUT_CLIP_MS),
                              }
                              const slip = trimMode === 'trim'
                              const onMove = (moveEvent: PointerEvent) => {
                                const delta = Math.round((moveEvent.clientX - origin.pointerX) * msPerPixel)
                                if (slip) {
                                  const preview = computeTrimPreview({
                                    mode: 'trim',
                                    edge: 'end',
                                    startMs: origin.startMs,
                                    endMs: origin.endMs,
                                    sourceDelta: delta,
                                    mediaDurationMs: origin.mediaDurationMs,
                                    nextClip: null,
                                  })
                                  if (!preview) return
                                  setSnapGuideMs(null)
                                  onTrimAudioClip(clip.id, preview.startMs, preview.endMs, origin.timelineStartMs)
                                  return
                                }
                                let endMs = origin.endMs + delta
                                const timelineEnd = origin.timelineStartMs + (endMs - origin.startMs)
                                const snapped = snapEdit(timelineEnd, { lane: 'audio', id: clip.id })
                                endMs += snapped.ms - timelineEnd
                                if (endMs - origin.startMs < 40) return
                                setSnapGuideMs(snapped.guideMs)
                                onTrimAudioClip(clip.id, origin.startMs, endMs)
                              }
                              const onUp = () => {
                                window.removeEventListener('pointermove', onMove)
                                window.removeEventListener('pointerup', onUp)
                                setSnapGuideMs(null)
                              }
                              window.addEventListener('pointermove', onMove)
                              window.addEventListener('pointerup', onUp)
                            }}
                          />
                        </TimelineClip>
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
              {snapGuideMs != null ? (
                <div
                  className="videon-cut-timeline__snap-guide"
                  style={{ left: `${timelineLeftPx(snapGuideMs, msPerPixel)}px` }}
                  aria-hidden="true"
                />
              ) : null}
              {marquee ? (
                <div
                  className="videon-cut-timeline__marquee"
                  style={{
                    left: `${Math.min(marquee.x0, marquee.x1)}px`,
                    top: `${Math.min(marquee.y0, marquee.y1)}px`,
                    width: `${Math.abs(marquee.x1 - marquee.x0)}px`,
                    height: `${Math.abs(marquee.y1 - marquee.y0)}px`,
                  }}
                  aria-hidden="true"
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <CutTimelineMinimap
        totalDurationMs={totalDurationMs}
        cutPlayheadMs={cutPlayheadMs}
        scrollLeft={viewportScroll.left}
        viewportWidthPx={viewportScroll.width}
        contentWidthPx={contentWidthPx}
        selection={selectionRangeMs}
        onSeek={onSeek}
        onPanRatio={(left) => {
          if (viewportRef.current) viewportRef.current.scrollLeft = left
          setViewportScroll((current) => ({ ...current, left }))
        }}
      />

    </div>
  )
}
