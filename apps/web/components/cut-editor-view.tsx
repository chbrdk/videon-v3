'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Input, Text, ToggleGroup, ToolButton } from '@msqdx/ui'
import { ContextMenu, Select, useToast, type ContextMenuItem } from '@msqdx/ui-client'
import { AspectPresetChips } from '@/components/aspect-preset-chips'
import { CutTimeline } from '@/components/cut-timeline'
import { CutEditorRail } from '@/components/cut-editor-rail'
import { CutBinPanel } from '@/components/cut-bin-panel'
import { CutClipInspector } from '@/components/cut-clip-inspector'
import { EditorMonitor } from '@/components/editor-monitor'
import { EditorStatusStrip, exportStatusLevel } from '@/components/editor-status-strip'
import { EditorOverflowItem, EditorOverflowMenu } from '@/components/editor-overflow-menu'
import { useTopbarTrailHost } from '@/components/topbar-trail-host'
import {
  CUT_ASPECT_PRESET_PIXELS,
  type CutAspectPreset,
  type CutExportFormat,
} from '@/lib/cut-canvas'
import {
  buildCutTimeline,
  cutPlayheadForSourceMs,
  cutTotalDurationMs,
  findTimelineItemAtCutMs,
  mapTranscriptToCutTimeline,
  mapTranscriptToVideoOverlay,
  splitSourceMsForCutPlayhead,
  type TranscriptSegment,
} from '@/lib/cut-timeline'
import { findProgramVideoAtCutMs } from '@/lib/cut-program-hit'
import { effectiveStemMutes } from '@/lib/cut-lane-aware-audio'
import {
  snapshotFromClips,
  type CutEditorSnapshot,
} from '@/lib/cut-editor-history'
import { EditorTransport } from '@/components/editor-transport'
import { IconRedo, IconSplit, IconUndo } from '@/components/editor-icons'
import { writeStoredActiveCut } from '@/lib/active-cut'
import { frameDurationMs, formatClock } from '@/lib/editor-time'
import { mediaStreamPlaybackUrl } from '@/lib/media-playback-url'
import {
  nextPlaybackTarget,
  resolveClipTransition,
  shouldAdvanceAtSourceMs,
} from '@/lib/cut-playback'
import { type TrimMode } from '@/lib/trim-modes'
import { paths } from '@/lib/paths'
import { mediaFramePosterUrl, FRAME_WIDTH_DEFAULT } from '@/lib/media-frame-poster'
import { useEditorKeyboard } from '@/lib/use-editor-keyboard'
import {
  useProgramAudioMixer,
  type ProgramTrackMutes,
} from '@/lib/use-program-audio-mixer'
import { useCutBusAudioMixer } from '@/lib/use-cut-bus-audio-mixer'
import {
  CUT_LEFT_OPEN_KEY,
  CUT_RIGHT_OPEN_KEY,
  readCutRailOpen,
  writeCutRailOpen,
} from '@/lib/cut-editor-rails'
import {
  buildCutTimelineContextMenuDraft,
  type CutTimelineContextMenuRequest,
  type CutTimelineContextTarget,
} from '@/lib/cut-timeline-context-menu'
import { clampContextMenuPosition } from '@/lib/timeline-context-menu'
import { useT } from '@/lib/user-prefs'

type Clip = {
  scene: {
    id: string
    position: number
    startMs: number
    endMs: number
    mediaAssetId: string
    timelineStartMs: number
  }
  media: { id: string; originalFilename: string; mimeType: string; durationMs?: number | null } | null
}

type CutDetail = {
  id: string
  name: string
  status: string
  width?: number | null
  height?: number | null
  frameRate?: number | null
}

type LibraryMedia = {
  id: string
  originalFilename: string
  lifecycleState: string
  durationMs?: number | null
  sceneCount?: number
}

type CutTrack = {
  id: string
  kind: string
  trackIndex: number
  name: string
  muted: boolean
}

type CutAudioClip = {
  id: string
  trackId: string
  cutId: string
  position: number
  mediaAssetId: string
  timelineStartMs: number
  startMs: number
  endMs: number
}

type CutVideoClip = {
  id: string
  trackId: string
  cutId: string
  position: number
  mediaAssetId: string
  timelineStartMs: number
  startMs: number
  endMs: number
}

const SEEK_STEP_MS = 1000

export function CutEditorView({
  platformProjectId,
  cutId,
}: {
  platformProjectId: string
  cutId: string
}) {
  const router = useRouter()
  const toast = useToast()
  const t = useT()
  const topbarTrailHost = useTopbarTrailHost()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cutPlayheadRef = useRef(0)
  const playingRef = useRef(false)
  const restoringRef = useRef(false)
  const advanceLockRef = useRef<number | null>(null)
  const playbackCacheRef = useRef<Map<string, string>>(new Map())
  const currentMediaIdRef = useRef<string | null>(null)
  const peaksBackfillAttemptedRef = useRef<Set<string>>(new Set())
  const [cut, setCut] = useState<CutDetail | null>(null)
  const [clips, setClips] = useState<Clip[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [cutPlayheadMs, setCutPlayheadMs] = useState(0)
  cutPlayheadRef.current = cutPlayheadMs
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [leftRailOpen, setLeftRailOpen] = useState(true)
  const [rightRailOpen, setRightRailOpen] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [timelineMenu, setTimelineMenu] = useState<{
    x: number
    y: number
    target: CutTimelineContextTarget
  } | null>(null)

  const notifyOk = useCallback((message: string) => {
    toast.push({ message, tone: 'ok' })
  }, [toast])
  const notifyError = useCallback((message: string) => {
    setError(message)
    toast.push({ message, tone: 'error' })
  }, [toast])
  const [exportBusy, setExportBusy] = useState(false)
  const [latestExport, setLatestExport] = useState<{
    id: string
    status: string
    format?: CutExportFormat
    errorMessage?: string | null
    downloadUrl?: string | null
  } | null>(null)
  const [aspectPreset, setAspectPreset] = useState<CutAspectPreset>('16:9')
  const [customWidth, setCustomWidth] = useState('1920')
  const [customHeight, setCustomHeight] = useState('1080')
  const [canvasBusy, setCanvasBusy] = useState(false)
  const [exportFormat, setExportFormat] = useState<CutExportFormat>('mp4')
  const [transcriptsByMediaId, setTranscriptsByMediaId] = useState<Record<string, TranscriptSegment[]>>({})
  const [libraryMedia, setLibraryMedia] = useState<LibraryMedia[]>([])
  const [undoStack, setUndoStack] = useState<CutEditorSnapshot[]>([])
  const [redoStack, setRedoStack] = useState<CutEditorSnapshot[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [monitorEngaged, setMonitorEngaged] = useState(false)
  const [trackMutes, setTrackMutes] = useState<ProgramTrackMutes>({
    v1: false,
    v2: false,
    a1: false,
    a2: false,
    v2a1: false,
    v2a2: false,
    ab: false,
  })
  const [trimMode, setTrimMode] = useState<TrimMode>('ripple')
  const [playbackUrlByMediaId, setPlaybackUrlByMediaId] = useState<Record<string, string>>({})
  const [voicePeaksByMediaId, setVoicePeaksByMediaId] = useState<Record<string, number[]>>({})
  const [musicPeaksByMediaId, setMusicPeaksByMediaId] = useState<Record<string, number[]>>({})
  const [mixPeaksByMediaId, setMixPeaksByMediaId] = useState<Record<string, number[]>>({})
  const [stemPresenceByMediaId, setStemPresenceByMediaId] = useState<
    Record<string, { voice: boolean; music: boolean }>
  >({})
  const [cutTracks, setCutTracks] = useState<CutTrack[]>([])
  const [audioClips, setAudioClips] = useState<CutAudioClip[]>([])
  const [videoClips, setVideoClips] = useState<CutVideoClip[]>([])
  const [selectedAudioClipId, setSelectedAudioClipId] = useState<string | null>(null)
  const [selectedVideoClipId, setSelectedVideoClipId] = useState<string | null>(null)

  const timeline = useMemo(
    () =>
      buildCutTimeline(
        clips.map((clip) => ({
          id: clip.scene.id,
          position: clip.scene.position,
          mediaAssetId: clip.scene.mediaAssetId,
          startMs: clip.scene.startMs,
          endMs: clip.scene.endMs,
          timelineStartMs: clip.scene.timelineStartMs ?? 0,
        })),
      ),
    [clips],
  )
  const totalDurationMs = useMemo(() => {
    const v1 = cutTotalDurationMs(
      clips.map((clip) => ({
        id: clip.scene.id,
        position: clip.scene.position,
        mediaAssetId: clip.scene.mediaAssetId,
        startMs: clip.scene.startMs,
        endMs: clip.scene.endMs,
        timelineStartMs: clip.scene.timelineStartMs ?? 0,
      })),
    )
    const v2 = videoClips.reduce((max, clip) => {
      const end = clip.timelineStartMs + Math.max(0, clip.endMs - clip.startMs)
      return Math.max(max, end)
    }, 0)
    return Math.max(v1, v2)
  }, [clips, videoClips])
  const videoOverlayTrack = cutTracks.find((track) => track.kind === 'video_overlay') ?? null
  const v2Muted = Boolean(trackMutes.v2 || videoOverlayTrack?.muted)
  const transcriptSegments = useMemo(
    () => mapTranscriptToCutTimeline(timeline, transcriptsByMediaId),
    [timeline, transcriptsByMediaId],
  )
  const v2TranscriptSegments = useMemo(
    () =>
      mapTranscriptToVideoOverlay(
        videoClips.map((clip) => ({
          id: clip.id,
          position: clip.position,
          mediaAssetId: clip.mediaAssetId,
          startMs: clip.startMs,
          endMs: clip.endMs,
          timelineStartMs: clip.timelineStartMs,
        })),
        transcriptsByMediaId,
      ),
    [transcriptsByMediaId, videoClips],
  )
  const sourceDurationMsByMediaId = useMemo(() => {
    const next: Record<string, number> = {}
    for (const clip of clips) {
      if (!clip.media) continue
      const duration = clip.media.durationMs ?? clip.scene.endMs
      next[clip.media.id] = Math.max(next[clip.media.id] ?? 0, duration)
    }
    for (const clip of videoClips) {
      const media = libraryMedia.find((entry) => entry.id === clip.mediaAssetId)
      const duration = media?.durationMs ?? clip.endMs
      next[clip.mediaAssetId] = Math.max(next[clip.mediaAssetId] ?? 0, duration)
    }
    return next
  }, [clips, libraryMedia, videoClips])

  const programHit = useMemo(
    () =>
      findProgramVideoAtCutMs({
        cutMs: cutPlayheadMs,
        v1Scenes: clips.map((clip) => ({
          id: clip.scene.id,
          position: clip.scene.position,
          mediaAssetId: clip.scene.mediaAssetId,
          startMs: clip.scene.startMs,
          endMs: clip.scene.endMs,
          timelineStartMs: clip.scene.timelineStartMs ?? 0,
        })),
        v2Clips: videoClips,
        v2Muted,
      }),
    [clips, cutPlayheadMs, v2Muted, videoClips],
  )
  const activeItem = timeline[activeIndex] ?? null
  const activeClip =
    (activeItem ? clips.find((clip) => clip.scene.id === activeItem.scene.id) : null) ??
    clips[activeIndex] ??
    null
  const inTimelineGap = Boolean(
    totalDurationMs > 0 &&
      !findProgramVideoAtCutMs({
        cutMs: cutPlayheadMs,
        v1Scenes: clips.map((clip) => ({
          id: clip.scene.id,
          position: clip.scene.position,
          mediaAssetId: clip.scene.mediaAssetId,
          startMs: clip.scene.startMs,
          endMs: clip.scene.endMs,
          timelineStartMs: clip.scene.timelineStartMs ?? 0,
        })),
        v2Clips: videoClips,
        v2Muted,
      }),
  )

  const rememberSnapshot = useCallback(() => {
    if (restoringRef.current || clips.length === 0) return
    const snapshot = snapshotFromClips(clips, cutPlayheadRef.current, activeIndex)
    setUndoStack((stack) => [...stack, snapshot].slice(-40))
    setRedoStack([])
  }, [activeIndex, clips])

  const load = useCallback(async () => {
    const response = await fetch(paths.routes.apiCutDetail(cutId, platformProjectId), { cache: 'no-store' })
    const body = (await response.json()) as {
      cut?: CutDetail
      clips?: Clip[]
      transcripts?: Record<string, TranscriptSegment[]>
      stems?: Record<
        string,
        {
          voicePeaks?: number[]
          musicPeaks?: number[]
          mixPeaks?: number[]
          method?: string | null
          voice?: boolean
          music?: boolean
        }
      >
      tracks?: CutTrack[]
      audioClips?: CutAudioClip[]
      videoClips?: CutVideoClip[]
      error?: { message?: string }
    }
    if (!response.ok) throw new Error(body.error?.message || t('cutEditor.loadFailed'))
    setCut(body.cut ?? null)
    if (body.cut) {
      writeStoredActiveCut({
        cutId: body.cut.id,
        platformProjectId,
        name: body.cut.name,
      })
      const w = body.cut.width ?? null
      const h = body.cut.height ?? null
      if (w === 1080 && h === 1920) setAspectPreset('9:16')
      else if (w === 1920 && h === 1080) setAspectPreset('16:9')
      else if (w === 1080 && h === 1080) setAspectPreset('1:1')
      else if (w != null && h != null) {
        setAspectPreset('custom')
        setCustomWidth(String(w))
        setCustomHeight(String(h))
      }
    }
    setClips(
      (body.clips ?? []).map((clip) => ({
        ...clip,
        scene: {
          ...clip.scene,
          timelineStartMs: clip.scene.timelineStartMs ?? 0,
        },
      })),
    )
    setCutTracks(body.tracks ?? [])
    setAudioClips(body.audioClips ?? [])
    setVideoClips(body.videoClips ?? [])
    setTranscriptsByMediaId(body.transcripts ?? {})
    const nextVoice: Record<string, number[]> = {}
    const nextMusic: Record<string, number[]> = {}
    const nextMix: Record<string, number[]> = {}
    const nextPresence: Record<string, { voice: boolean; music: boolean }> = {}
    for (const [mediaId, stem] of Object.entries(body.stems ?? {})) {
      if (stem.voicePeaks?.length) nextVoice[mediaId] = stem.voicePeaks
      if (stem.musicPeaks?.length) nextMusic[mediaId] = stem.musicPeaks
      if (stem.mixPeaks?.length) nextMix[mediaId] = stem.mixPeaks
      nextPresence[mediaId] = {
        voice: Boolean(stem.voice ?? stem.voicePeaks?.length),
        music: Boolean(stem.music ?? stem.musicPeaks?.length),
      }
    }
    setVoicePeaksByMediaId(nextVoice)
    setMusicPeaksByMediaId(nextMusic)
    setMixPeaksByMediaId(nextMix)
    setStemPresenceByMediaId(nextPresence)
    setActiveIndex((current) => Math.min(current, Math.max((body.clips?.length ?? 1) - 1, 0)))
  }, [cutId, platformProjectId, t])

  const loadLibrary = useCallback(async () => {
    const response = await fetch(paths.routes.apiMediaList(platformProjectId), { cache: 'no-store' })
    const body = (await response.json()) as { items?: LibraryMedia[] }
    if (response.ok) {
      setLibraryMedia((body.items ?? []).filter((item) => item.lifecycleState === 'ready'))
    }
  }, [platformProjectId])

  const loadPlayback = useCallback(
    async (clip: Clip, options?: { force?: boolean }) => {
      if (!clip.media) {
        setPlaybackUrl(null)
        currentMediaIdRef.current = null
        return
      }
      const mediaId = clip.media.id
      if (!options?.force && playbackCacheRef.current.has(mediaId)) {
        currentMediaIdRef.current = mediaId
        setPlaybackUrl(playbackCacheRef.current.get(mediaId) ?? null)
        return
      }
      // Cut detail already proved Model B access — use relative stream URL (no extra playback RTT).
      const playback = mediaStreamPlaybackUrl(mediaId, platformProjectId)
      playbackCacheRef.current.set(mediaId, playback)
      currentMediaIdRef.current = mediaId
      setPlaybackUrl(playback)
    },
    [platformProjectId],
  )

  const patchTimeline = async (payload: Record<string, unknown>) => {
    rememberSnapshot()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(paths.routes.apiCutDetail(cutId, platformProjectId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await response.text()
      let body: { error?: { message?: string } } = {}
      if (text) {
        try {
          body = JSON.parse(text) as { error?: { message?: string } }
        } catch {
          throw new Error(
            response.ok
              ? 'Ungültige Server-Antwort'
              : `Timeline-Änderung fehlgeschlagen (${response.status})`,
          )
        }
      } else if (!response.ok) {
        throw new Error(`Timeline-Änderung fehlgeschlagen (${response.status})`)
      }
      if (!response.ok) throw new Error(body.error?.message || 'Timeline-Änderung fehlgeschlagen')
      await load()
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Timeline-Änderung fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const restoreSnapshot = async (snapshot: CutEditorSnapshot) => {
    restoringRef.current = true
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(paths.routes.apiCutDetail(cutId, platformProjectId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', scenes: snapshot.scenes }),
      })
      const body = (await response.json()) as { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Rückgängig fehlgeschlagen')
      await load()
      setCutPlayheadMs(snapshot.cutPlayheadMs)
      setActiveIndex(snapshot.activeIndex)
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Rückgängig fehlgeschlagen')
    } finally {
      restoringRef.current = false
      setBusy(false)
    }
  }

  const seekToCutMs = useCallback(
    (cutMs: number) => {
      advanceLockRef.current = null
      const clamped = Math.max(0, Math.min(cutMs, totalDurationMs))
      setCutPlayheadMs(clamped)
      const v1Scenes = clips.map((clip) => ({
        id: clip.scene.id,
        position: clip.scene.position,
        mediaAssetId: clip.scene.mediaAssetId,
        startMs: clip.scene.startMs,
        endMs: clip.scene.endMs,
        timelineStartMs: clip.scene.timelineStartMs ?? 0,
      }))
      const hit = findProgramVideoAtCutMs({
        cutMs: clamped,
        v1Scenes,
        v2Clips: videoClips,
        v2Muted,
      })
      if (!hit) {
        const video = videoRef.current
        if (video && !video.paused) {
          playingRef.current = false
          video.pause()
        }
        return
      }
      if (hit.lane === 'v2') {
        setSelectedVideoClipId(hit.clip.id)
        setSelectedAudioClipId(null)
        const mediaId = hit.clip.mediaAssetId
        const url = playbackUrlByMediaId[mediaId] ?? playbackCacheRef.current.get(mediaId) ?? null
        if (url) {
          currentMediaIdRef.current = mediaId
          setPlaybackUrl(url)
        }
        const video = videoRef.current
        if (video && !Number.isNaN(video.duration)) {
          video.currentTime = hit.sourceMs / 1000
        }
        return
      }
      setSelectedVideoClipId(null)
      setActiveIndex(hit.item.index)
      const video = videoRef.current
      if (video && !Number.isNaN(video.duration)) {
        video.currentTime = hit.sourceMs / 1000
      }
    },
    [clips, playbackUrlByMediaId, totalDurationMs, v2Muted, videoClips],
  )

  useEffect(() => {
    const mediaIds = [
      ...new Set([
        ...clips.map((clip) => clip.scene.mediaAssetId),
        ...audioClips.map((clip) => clip.mediaAssetId),
        ...videoClips.map((clip) => clip.mediaAssetId),
      ]),
    ]
    if (mediaIds.length === 0) {
      setPlaybackUrlByMediaId({})
      return
    }
    let cancelled = false
    const apply = () => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const mediaId of mediaIds) {
        const url = mediaStreamPlaybackUrl(mediaId, platformProjectId)
        playbackCacheRef.current.set(mediaId, url)
        next[mediaId] = url
      }
      setPlaybackUrlByMediaId(next)
    }
    // Defer non-active URL map so the active monitor load wins first paint.
    const idle = typeof window !== 'undefined' ? window.requestIdleCallback : undefined
    if (typeof idle === 'function') {
      const idleId = idle(apply, { timeout: 1800 })
      return () => {
        cancelled = true
        window.cancelIdleCallback?.(idleId)
      }
    }
    const timer = globalThis.setTimeout(apply, 350)
    return () => {
      cancelled = true
      globalThis.clearTimeout(timer)
    }
  }, [clips, audioClips, videoClips, platformProjectId])

  useEffect(() => {
    setLeftRailOpen(readCutRailOpen(CUT_LEFT_OPEN_KEY, true))
    setRightRailOpen(readCutRailOpen(CUT_RIGHT_OPEN_KEY, true))
  }, [])

  useEffect(() => {
    setMonitorEngaged(false)
  }, [activeIndex, playbackUrl])

  const activePosterUrl = useMemo(() => {
    const clip = clips[activeIndex]
    if (!clip) return null
    const mediaId = clip.media?.id ?? clip.scene.mediaAssetId
    if (!mediaId) return null
    return mediaFramePosterUrl(mediaId, platformProjectId, clip.scene.startMs, FRAME_WIDTH_DEFAULT)
  }, [activeIndex, clips, platformProjectId])

  // Idle mixPeaks backfill for timeline media analyzed before Wave 3 (concurrency 1).
  useEffect(() => {
    const mediaIds = [
      ...new Set(
        [...clips.map((clip) => clip.scene.mediaAssetId), ...videoClips.map((clip) => clip.mediaAssetId)].filter(
          (id) =>
            !(voicePeaksByMediaId[id]?.length || mixPeaksByMediaId[id]?.length) &&
            !peaksBackfillAttemptedRef.current.has(id),
        ),
      ),
    ]
    if (mediaIds.length === 0) return
    let cancelled = false
    const run = async () => {
      for (const mediaId of mediaIds) {
        if (cancelled) return
        peaksBackfillAttemptedRef.current.add(mediaId)
        try {
          const response = await fetch(paths.routes.apiMediaPeaksBackfill(mediaId, platformProjectId), {
            method: 'POST',
          })
          if (!response.ok) continue
          const body = (await response.json()) as { status?: string; mixPeaks?: number[] }
          if (body.status === 'ready' && body.mixPeaks?.length) {
            setMixPeaksByMediaId((prev) =>
              prev[mediaId] ? prev : { ...prev, [mediaId]: body.mixPeaks as number[] },
            )
          }
        } catch {
          // ignore idle backfill errors
        }
      }
    }
    const idle = typeof window !== 'undefined' ? window.requestIdleCallback : undefined
    if (typeof idle === 'function') {
      const idleId = idle(() => void run(), { timeout: 8000 })
      return () => {
        cancelled = true
        window.cancelIdleCallback?.(idleId)
      }
    }
    const timer = globalThis.setTimeout(() => void run(), 2000)
    return () => {
      cancelled = true
      globalThis.clearTimeout(timer)
    }
  }, [clips, videoClips, mixPeaksByMediaId, platformProjectId, voicePeaksByMediaId])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Cut nicht verfügbar'))
    void loadLibrary().catch(() => {})
  }, [load, loadLibrary])

  useEffect(() => {
    const clip = clips[activeIndex]
    if (!clip) return
    const mediaId = clip.media?.id ?? null
    if (mediaId && currentMediaIdRef.current === mediaId && playbackUrl) return
    void loadPlayback(clip).catch((err) => notifyError(err instanceof Error ? err.message : 'Wiedergabe fehlgeschlagen'))
  }, [clips, activeIndex, loadPlayback, playbackUrl])

  const activeMediaId =
    programHit?.lane === 'v2'
      ? programHit.clip.mediaAssetId
      : programHit?.lane === 'v1'
        ? programHit.item.scene.mediaAssetId
        : (activeClip?.media?.id ?? activeClip?.scene.mediaAssetId ?? null)
  const activeStemPresence = activeMediaId ? stemPresenceByMediaId[activeMediaId] : undefined
  const voiceStemUrl =
    activeMediaId && activeStemPresence?.voice
      ? paths.routes.apiMediaStemStream(activeMediaId, 'voice', platformProjectId)
      : null
  const musicStemUrl =
    activeMediaId && activeStemPresence?.music
      ? paths.routes.apiMediaStemStream(activeMediaId, 'music', platformProjectId)
      : null
  const hasAnyStemAudio = useMemo(
    () => Object.values(stemPresenceByMediaId).some((entry) => entry.voice || entry.music),
    [stemPresenceByMediaId],
  )
  const hasStemAudio = Boolean(voiceStemUrl || musicStemUrl) || hasAnyStemAudio
  const stemMutes = effectiveStemMutes({
    programLane: programHit?.lane ?? null,
    mutes: trackMutes,
  })

  useProgramAudioMixer({
    videoRef,
    voiceUrl: voiceStemUrl,
    musicUrl: musicStemUrl,
    mutes: {
      ...trackMutes,
      a1: stemMutes.a1,
      a2: stemMutes.a2,
    },
    enabled: Boolean(playbackUrl),
  })

  const audioBusTrack = cutTracks.find((track) => track.kind === 'audio_bus') ?? cutTracks[0] ?? null

  useCutBusAudioMixer({
    cutPlayheadMs,
    isPlaying,
    clips: audioClips,
    playbackUrlByMediaId,
    muted: Boolean(trackMutes.ab || audioBusTrack?.muted),
    enabled: audioClips.length > 0,
  })

  useEffect(() => {
    const video = videoRef.current
    const item = timeline[activeIndex]
    const clip = item ? clips.find((entry) => entry.scene.id === item.scene.id) : null
    if (!video || !clip || !item || !playbackUrl) return

    const frameMs = frameDurationMs(cut?.frameRate)

    const onLoaded = () => {
      if (video.readyState < 1) return
      const playhead = cutPlayheadRef.current
      const mapped = findTimelineItemAtCutMs(timeline, playhead)
      if (!mapped || mapped.scene.id !== item.scene.id) return
      const targetSec = (clip.scene.startMs + Math.max(playhead - item.cutStartMs, 0)) / 1000
      if (Number.isFinite(targetSec)) {
        try {
          video.currentTime = targetSec
        } catch {
          // Ignore seeks before the media timeline is ready.
        }
      }
      if (playingRef.current) void video.play().catch(() => {})
    }
    const onTime = () => {
      const sourceMs = Math.floor(video.currentTime * 1000)
      const nextCutMs = cutPlayheadForSourceMs(timeline, clip.scene.id, sourceMs)
      setCutPlayheadMs(nextCutMs)

      if (!playingRef.current) return
      if (advanceLockRef.current === activeIndex) return
      if (
        !shouldAdvanceAtSourceMs({
          sourceMs,
          clipEndMs: clip.scene.endMs,
          frameMs,
        })
      ) {
        return
      }

      const nextTarget = nextPlaybackTarget(timeline, activeIndex)
      const nextClip = nextTarget
        ? clips.find((entry) => entry.scene.id === timeline[nextTarget.index]?.scene.id) ?? null
        : null
      const transition = resolveClipTransition({
        current: {
          mediaAssetId: clip.scene.mediaAssetId,
          startMs: clip.scene.startMs,
          endMs: clip.scene.endMs,
        },
        next: nextClip
          ? {
              mediaAssetId: nextClip.scene.mediaAssetId,
              startMs: nextClip.scene.startMs,
              endMs: nextClip.scene.endMs,
            }
          : null,
      })

      advanceLockRef.current = activeIndex

      if (transition === 'sequence-end' || !nextTarget || !nextClip) {
        playingRef.current = false
        video.pause()
        setCutPlayheadMs(totalDurationMs)
        return
      }

      setCutPlayheadMs(nextTarget.cutStartMs)

      if (transition === 'same-media-seek') {
        video.currentTime = nextTarget.sourceStartMs / 1000
        setActiveIndex(nextTarget.index)
        if (playingRef.current) void video.play().catch(() => {})
        return
      }

      const prefetchUrl =
        playbackUrlByMediaId[nextTarget.mediaAssetId] ??
        playbackCacheRef.current.get(nextTarget.mediaAssetId) ??
        null
      playingRef.current = true
      if (prefetchUrl) {
        playbackCacheRef.current.set(nextTarget.mediaAssetId, prefetchUrl)
        currentMediaIdRef.current = nextTarget.mediaAssetId
        setPlaybackUrl(prefetchUrl)
        setActiveIndex(nextTarget.index)
        return
      }
      setActiveIndex(nextTarget.index)
      void loadPlayback(nextClip).catch((err) =>
        notifyError(err instanceof Error ? err.message : 'Wiedergabe fehlgeschlagen'),
      )
    }
    const onPlay = () => {
      playingRef.current = true
      setIsPlaying(true)
    }
    const onPause = () => {
      playingRef.current = false
      setIsPlaying(false)
    }
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    if (video.readyState >= 1) onLoaded()
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [
    clips,
    activeIndex,
    playbackUrl,
    timeline,
    cut?.frameRate,
    totalDurationMs,
    playbackUrlByMediaId,
    loadPlayback,
  ])

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      setMonitorEngaged(true)
      advanceLockRef.current = null
      playingRef.current = true
      await video.play()
    } else {
      playingRef.current = false
      video.pause()
    }
  }

  const stepClip = (delta: number) => {
    const next = Math.min(Math.max(activeIndex + delta, 0), clips.length - 1)
    const item = timeline[next]
    if (!item) return
    setActiveIndex(next)
    seekToCutMs(item.cutStartMs)
  }

  const nudgePlayhead = (deltaMs: number) => {
    seekToCutMs(cutPlayheadRef.current + deltaMs)
  }

  const frameStep = (direction: -1 | 1) => {
    nudgePlayhead(direction * frameDurationMs(cut?.frameRate))
  }

  const deleteCut = async () => {
    if (!window.confirm('Cut archivieren?')) return
    setBusy(true)
    try {
      const response = await fetch(paths.routes.apiCutDetail(cutId, platformProjectId), { method: 'DELETE' })
      const body = (await response.json()) as { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Löschen fehlgeschlagen')
      router.push(paths.routes.cutsFor(platformProjectId))
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const splitTarget = splitSourceMsForCutPlayhead(timeline, cutPlayheadMs)
  const canUndo = undoStack.length > 0
  const canRedo = redoStack.length > 0

  const undo = () => {
    if (!canUndo) return
    const snapshot = undoStack[undoStack.length - 1]
    const current = snapshotFromClips(clips, cutPlayheadMs, activeIndex)
    setUndoStack((stack) => stack.slice(0, -1))
    setRedoStack((stack) => [...stack, current])
    void restoreSnapshot(snapshot)
  }

  const redo = () => {
    if (!canRedo) return
    const snapshot = redoStack[redoStack.length - 1]
    const current = snapshotFromClips(clips, cutPlayheadMs, activeIndex)
    setRedoStack((stack) => stack.slice(0, -1))
    setUndoStack((stack) => [...stack, current])
    void restoreSnapshot(snapshot)
  }

  const setLeftOpen = useCallback((open: boolean) => {
    setLeftRailOpen(open)
    writeCutRailOpen(CUT_LEFT_OPEN_KEY, open)
  }, [])

  const setRightOpen = useCallback((open: boolean) => {
    setRightRailOpen(open)
    writeCutRailOpen(CUT_RIGHT_OPEN_KEY, open)
  }, [])

  const openTimelineContextMenu = useCallback((request: CutTimelineContextMenuRequest) => {
    const { clientX, clientY, ...target } = request
    const pos = clampContextMenuPosition(clientX, clientY)
    setTimelineMenu({ x: pos.x, y: pos.y, target })
  }, [])

  const closeTimelineContextMenu = useCallback(() => setTimelineMenu(null), [])

  const runTimelineContextAction = (actionId: string, target: CutTimelineContextTarget) => {
    if (target.kind === 'cut-lane') {
      if (actionId === 'seek-here') seekToCutMs(target.atMs)
      return
    }
    if (actionId === 'inspect-clip') {
      setActiveIndex(target.index)
      setSelectedAudioClipId(null)
      setRightOpen(true)
      seekToCutMs(target.cutStartMs)
      return
    }
    if (actionId === 'seek-clip-start') {
      setActiveIndex(target.index)
      seekToCutMs(target.cutStartMs)
      return
    }
    if (actionId === 'split-at-playhead' && splitTarget?.sceneId === target.sceneId) {
      void patchTimeline({ action: 'split', sceneId: target.sceneId, atMs: splitTarget.atMs })
      return
    }
    if (actionId === 'merge-next') {
      void patchTimeline({ action: 'merge', sceneId: target.sceneId })
      return
    }
    if (actionId === 'delete-clip') {
      void patchTimeline({ action: 'delete', sceneId: target.sceneId })
    }
  }

  const timelineContextItems: ContextMenuItem[] = timelineMenu
    ? buildCutTimelineContextMenuDraft(timelineMenu.target).map((draft) => ({
        id: draft.id,
        label: draft.label,
        disabled: Boolean(draft.disabled) || busy,
        danger: draft.danger,
        separator: draft.separator,
        section: draft.section,
        onSelect: () => {
          if (draft.section || draft.disabled) return
          runTimelineContextAction(draft.id, timelineMenu.target)
        },
      }))
    : []

  const timelineAudioClips = useMemo(
    () =>
      audioClips.map((clip) => ({
        id: clip.id,
        trackId: clip.trackId,
        mediaAssetId: clip.mediaAssetId,
        timelineStartMs: clip.timelineStartMs,
        startMs: clip.startMs,
        endMs: clip.endMs,
        label:
          libraryMedia.find((media) => media.id === clip.mediaAssetId)?.originalFilename ??
          audioBusTrack?.name ??
          'Voice-Over',
      })),
    [audioClips, audioBusTrack?.name, libraryMedia],
  )

  const timelineVideoClips = useMemo(
    () =>
      videoClips.map((clip) => ({
        id: clip.id,
        trackId: clip.trackId,
        mediaAssetId: clip.mediaAssetId,
        position: clip.position,
        timelineStartMs: clip.timelineStartMs,
        startMs: clip.startMs,
        endMs: clip.endMs,
        label: libraryMedia.find((media) => media.id === clip.mediaAssetId)?.originalFilename ?? 'V2',
      })),
    [libraryMedia, videoClips],
  )

  const addWholeVideoFromBin = async (mediaId: string) => {
    const media = libraryMedia.find((item) => item.id === mediaId)
    if (!media) return
    let endMs = media.durationMs ?? 0
    if (!endMs) {
      const response = await fetch(paths.routes.apiMediaDetail(media.id, platformProjectId), {
        cache: 'no-store',
      })
      const body = (await response.json()) as { media?: { durationMs?: number | null } }
      endMs = body.media?.durationMs ?? 60_000
    }
    await patchTimeline({
      action: 'addScene',
      mediaAssetId: media.id,
      startMs: 0,
      endMs: Math.max(endMs, 1000),
      afterSceneId: activeClip?.scene.id ?? null,
    })
  }

  const addVoiceOverFromBin = (mediaId: string) => {
    const media = libraryMedia.find((item) => item.id === mediaId)
    if (!media) return
    void patchTimeline({
      action: 'addAudioClip',
      mediaAssetId: media.id,
      startMs: 0,
      endMs: Math.max(media.durationMs ?? 60_000, 1000),
      timelineStartMs: cutPlayheadMs,
    })
  }

  const addScenesFromBin = async (
    mediaId: string,
    scenes: Array<{ sceneKey: string; startMs: number; endMs: number }>,
  ) => {
    if (!scenes.length) return
    await patchTimeline({
      action: 'addScenes',
      afterSceneId: activeClip?.scene.id ?? null,
      scenes: scenes.map((scene) => ({
        mediaAssetId: mediaId,
        startMs: scene.startMs,
        endMs: scene.endMs,
        sceneKey: scene.sceneKey,
      })),
    })
  }

  const applyCanvas = async () => {
    setCanvasBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { action: 'setCanvas', aspectPreset }
      if (aspectPreset === 'custom') {
        body.width = Number.parseInt(customWidth, 10)
        body.height = Number.parseInt(customHeight, 10)
      }
      const response = await fetch(paths.routes.apiCutDetail(cutId, platformProjectId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as {
        cut?: CutDetail
        error?: { message?: string }
      }
      if (!response.ok || !payload.cut) {
        throw new Error(payload.error?.message || t('cutEditor.canvasFailed'))
      }
      setCut(payload.cut)
      notifyOk(t('cutEditor.canvasApplied'))
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t('cutEditor.canvasFailed'))
    } finally {
      setCanvasBusy(false)
    }
  }

  const startExport = async (format: CutExportFormat = exportFormat) => {
    setExportBusy(true)
    setError(null)
    try {
      const response = await fetch(paths.routes.apiCutExports(cutId, platformProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      })
      const body = (await response.json()) as {
        export?: { id: string; status: string; format?: CutExportFormat; errorMessage?: string | null }
        error?: { message?: string }
      }
      if (!response.ok || !body.export) throw new Error(body.error?.message || t('cutEditor.exportFailed'))
      setLatestExport({
        id: body.export.id,
        status: body.export.status,
        format: body.export.format ?? format,
        errorMessage: body.export.errorMessage,
      })
      notifyOk(t('cutEditor.exportStarted'))
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t('cutEditor.exportFailed'))
    } finally {
      setExportBusy(false)
    }
  }

  useEffect(() => {
    if (!latestExport || (latestExport.status !== 'queued' && latestExport.status !== 'running')) return
    const timer = window.setInterval(() => {
      void (async () => {
        const response = await fetch(
          paths.routes.apiCutExportDetail(cutId, latestExport.id, platformProjectId),
          { cache: 'no-store' },
        )
        const body = (await response.json()) as {
          export?: { id: string; status: string; format?: CutExportFormat; errorMessage?: string | null }
          downloadUrl?: string | null
        }
        if (!body.export) return
        setLatestExport({
          id: body.export.id,
          status: body.export.status,
          format: body.export.format ?? latestExport.format,
          errorMessage: body.export.errorMessage,
          downloadUrl: body.downloadUrl,
        })
        if (body.export.status === 'succeeded') notifyOk(t('cutEditor.exportReady'))
        if (body.export.status === 'failed') {
          notifyError(body.export.errorMessage || t('cutEditor.exportFailed'))
        }
      })()
    }, 2500)
    return () => window.clearInterval(timer)
  }, [cutId, latestExport, notifyError, notifyOk, platformProjectId, t])

  useEditorKeyboard({
    enabled: Boolean(cut) && !busy,
    onTogglePlay: () => void togglePlayback(),
    onSeekBack: () => nudgePlayhead(-SEEK_STEP_MS),
    onSeekForward: () => nudgePlayhead(SEEK_STEP_MS),
    onStepBack: () => stepClip(-1),
    onStepForward: () => stepClip(1),
    onFrameBack: () => frameStep(-1),
    onFrameForward: () => frameStep(1),
    onSplit: () => {
      if (!splitTarget) return
      void patchTimeline({ action: 'split', sceneId: splitTarget.sceneId, atMs: splitTarget.atMs })
    },
    onDelete: () => {
      if (!activeClip || clips.length <= 1) return
      void patchTimeline({ action: 'delete', sceneId: activeClip.scene.id })
    },
    onUndo: undo,
    onRedo: redo,
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Close ephemeral UI first; do not persist rail closed-state (Esc ≠ hide forever).
        if (timelineMenu || showShortcuts) {
          setShowShortcuts(false)
          setTimelineMenu(null)
          return
        }
        setLeftRailOpen(false)
        setRightRailOpen(false)
        return
      }
      if (event.key === '?' && !event.metaKey && !event.ctrlKey) {
        const target = event.target
        if (target instanceof HTMLElement) {
          const tag = target.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
        }
        event.preventDefault()
        setShowShortcuts((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showShortcuts, timelineMenu])

  if (error && !cut) {
    return (
      <div className="videon-editor-error">
        <Text role="title">Cut nicht verfügbar</Text>
        <Text role="body">{error}</Text>
      </div>
    )
  }

  if (!cut) return <Text role="body">Cut wird geladen …</Text>

  const toolbarMeta = `${clips.length} Clips · ${cut.status}${cut.width && cut.height ? ` · ${cut.width}×${cut.height}` : ''}`
  const toolbarChrome = (
    <div
      className={
        topbarTrailHost
          ? 'videon-cut-topbar-chrome'
          : 'videon-nle__toolbar videon-nle__toolbar--slim'
      }
      role="toolbar"
      aria-label="Cut-Werkzeuge"
      data-testid="cut-editor-toolbar"
    >
      <div className="videon-nle__toolbar-title">
        <Link className="videon-nle__back" href={paths.routes.cutsFor(platformProjectId)}>
          ←
        </Link>
        <h2 title={toolbarMeta}>{cut.name}</h2>
      </div>
      <div className="videon-nle__toolbar-groups">
        <div className="videon-nle__tool-group">
          <ToolButton label="Rückgängig" disabled={busy || !canUndo} onClick={undo}>
            <IconUndo />
          </ToolButton>
          <ToolButton label="Wiederholen" disabled={busy || !canRedo} onClick={redo}>
            <IconRedo />
          </ToolButton>
          <ToolButton
            label="An Playhead teilen"
            disabled={busy || !splitTarget}
            onClick={() =>
              void patchTimeline({
                action: 'split',
                sceneId: splitTarget?.sceneId,
                atMs: splitTarget?.atMs,
              })
            }
          >
            <IconSplit />
          </ToolButton>
        </div>
        <ToggleGroup
          aria-label="Trim-Modus"
          size="sm"
          value={trimMode}
          onChange={(value) => setTrimMode(value as typeof trimMode)}
          options={[
            { value: 'trim', label: 'Trim' },
            { value: 'ripple', label: 'Rip' },
            { value: 'roll', label: 'Roll' },
          ]}
        />
        <div className="videon-nle__tool-group">
          <AspectPresetChips
            ariaLabel={t('cutEditor.canvas')}
            value={aspectPreset}
            disabled={busy || canvasBusy}
            options={[
              { value: '9:16', label: '9:16' },
              { value: '16:9', label: '16:9' },
              { value: '1:1', label: '1:1' },
              { value: 'custom', label: t('cutEditor.custom') },
            ]}
            onChange={(next) => {
              setAspectPreset(next)
              if (next !== 'custom') {
                const pixels = CUT_ASPECT_PRESET_PIXELS[next]
                setCustomWidth(String(pixels.width))
                setCustomHeight(String(pixels.height))
                void (async () => {
                  setCanvasBusy(true)
                  try {
                    const response = await fetch(paths.routes.apiCutDetail(cutId, platformProjectId), {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'setCanvas', aspectPreset: next }),
                    })
                    const payload = (await response.json()) as {
                      cut?: CutDetail
                      error?: { message?: string }
                    }
                    if (!response.ok || !payload.cut) {
                      throw new Error(payload.error?.message || t('cutEditor.canvasFailed'))
                    }
                    setCut(payload.cut)
                  } catch (err) {
                    notifyError(err instanceof Error ? err.message : t('cutEditor.canvasFailed'))
                  } finally {
                    setCanvasBusy(false)
                  }
                })()
              }
            }}
          />
          {aspectPreset === 'custom' ? (
            <>
              <Input
                aria-label={t('cutEditor.width')}
                type="number"
                min={2}
                max={3840}
                step={2}
                value={customWidth}
                disabled={busy || canvasBusy}
                onChange={(event) => setCustomWidth(event.target.value)}
              />
              <Input
                aria-label={t('cutEditor.height')}
                type="number"
                min={2}
                max={3840}
                step={2}
                value={customHeight}
                disabled={busy || canvasBusy}
                onChange={(event) => setCustomHeight(event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || canvasBusy}
                onClick={() => void applyCanvas()}
              >
                OK
              </Button>
            </>
          ) : null}
        </div>
        <div className="videon-nle__tool-group">
          <Select
            aria-label={t('cutEditor.exportFormat')}
            size="sm"
            value={exportFormat}
            disabled={busy || exportBusy || clips.length === 0}
            options={[
              { value: 'mp4', label: 'MP4' },
              { value: 'premiere_xml', label: 'PPro' },
            ]}
            onChange={(value: string) => setExportFormat(value as CutExportFormat)}
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void startExport(exportFormat)}
            disabled={busy || exportBusy || clips.length === 0}
          >
            {exportBusy || latestExport?.status === 'queued' || latestExport?.status === 'running'
              ? '…'
              : 'Export'}
          </Button>
        </div>
        <div className="videon-nle__tool-cluster">
          <Button
            type="button"
            variant={leftRailOpen ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setLeftOpen(!leftRailOpen)}
          >
            Bin
          </Button>
          <Button
            type="button"
            variant={rightRailOpen ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setRightOpen(!rightRailOpen)}
          >
            Clip
          </Button>
          <ToolButton
            label="Tastaturkürzel"
            active={showShortcuts}
            onClick={() => setShowShortcuts((current) => !current)}
          >
            ?
          </ToolButton>
          <EditorOverflowMenu>
            {({ close }) => (
              <>
                <EditorOverflowItem
                  close={close}
                  disabled={busy || !activeClip || activeIndex >= clips.length - 1}
                  onClick={() => void patchTimeline({ action: 'merge', sceneId: activeClip?.scene.id })}
                >
                  Verbinden
                </EditorOverflowItem>
                <EditorOverflowItem
                  close={close}
                  disabled={busy || clips.length <= 1 || !activeClip}
                  onClick={() => void patchTimeline({ action: 'delete', sceneId: activeClip?.scene.id })}
                >
                  Löschen
                </EditorOverflowItem>
                <EditorOverflowItem
                  close={close}
                  disabled={busy || exportBusy || clips.length === 0}
                  onClick={() => void startExport('mp4')}
                >
                  {t('cutEditor.exportMp4')}
                </EditorOverflowItem>
                <EditorOverflowItem
                  close={close}
                  disabled={busy || exportBusy || clips.length === 0}
                  onClick={() => void startExport('premiere_xml')}
                >
                  {t('cutEditor.exportPremiere')}
                </EditorOverflowItem>
                {latestExport?.status === 'succeeded' && latestExport.downloadUrl ? (
                  <EditorOverflowItem close={close} href={latestExport.downloadUrl}>
                    {latestExport.format === 'premiere_xml'
                      ? t('cutEditor.downloadXml')
                      : t('cutEditor.downloadMp4')}
                  </EditorOverflowItem>
                ) : null}
                <EditorOverflowItem close={close} danger disabled={busy} onClick={() => void deleteCut()}>
                  Archivieren
                </EditorOverflowItem>
              </>
            )}
          </EditorOverflowMenu>
        </div>
      </div>
    </div>
  )

  return (
    <div
      className={
        topbarTrailHost
          ? 'videon-nle videon-nle--player-first videon-nle--topbar-chrome'
          : 'videon-nle videon-nle--player-first'
      }
    >
      {topbarTrailHost ? createPortal(toolbarChrome, topbarTrailHost) : null}
      {topbarTrailHost && !latestExport ? null : (
        <div className="videon-nle__top">
          {topbarTrailHost ? null : toolbarChrome}

          {latestExport ? (
            <EditorStatusStrip
              level={exportStatusLevel(latestExport.status)}
              label={
                latestExport.status === 'succeeded'
                  ? t('cutEditor.exportReady')
                  : latestExport.status === 'failed'
                    ? t('cutEditor.exportFailed')
                    : t('cutEditor.exportBusy')
              }
              detail={latestExport.errorMessage ?? latestExport.status}
              actionLabel={
                latestExport.status === 'succeeded' && latestExport.downloadUrl
                  ? latestExport.format === 'premiere_xml'
                    ? t('cutEditor.downloadXml')
                    : t('cutEditor.downloadMp4')
                  : undefined
              }
              onAction={
                latestExport.status === 'succeeded' && latestExport.downloadUrl
                  ? () => {
                      window.location.href = latestExport.downloadUrl!
                    }
                  : undefined
              }
            />
          ) : null}
        </div>
      )}

      <div className="videon-nle__workspace">
        <CutEditorRail
          side="left"
          title={`Mediathek (${libraryMedia.length})`}
          open={leftRailOpen}
          onClose={() => setLeftOpen(false)}
        >
          <CutBinPanel
            platformProjectId={platformProjectId}
            libraryMedia={libraryMedia}
            busy={busy}
            onAddWholeVideo={(mediaId) => void addWholeVideoFromBin(mediaId)}
            onAddVoiceOver={addVoiceOverFromBin}
            onAddScenes={(mediaId, scenes) => void addScenesFromBin(mediaId, scenes)}
          />
        </CutEditorRail>

        <section className="videon-nle__program">
          <EditorMonitor
            videoRef={videoRef}
            playbackUrl={playbackUrl}
            frameMs={frameDurationMs(cut.frameRate)}
            disabled={!playbackUrl || busy}
            onSeekDelta={(deltaMs) => nudgePlayhead(deltaMs)}
          >
            {playbackUrl ? (
              <div className={`videon-nle__video-stack${inTimelineGap ? ' is-gap' : ''}`}>
                <video
                  ref={videoRef}
                  className="videon-nle__video"
                  src={playbackUrl}
                  poster={activePosterUrl ?? undefined}
                  playsInline
                  preload={monitorEngaged || isPlaying ? 'auto' : 'none'}
                  style={inTimelineGap ? { visibility: 'hidden' } : undefined}
                />
                {inTimelineGap ? (
                  <div className="videon-nle__video-placeholder videon-nle__video-placeholder--gap" aria-label="Lücke">
                    <Text role="body">Lücke</Text>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="videon-nle__video-placeholder">
                <Text role="body">Keine Wiedergabe für diesen Clip</Text>
              </div>
            )}
          </EditorMonitor>

          <EditorTransport
            currentMs={cutPlayheadMs}
            durationMs={totalDurationMs}
            frameRate={cut.frameRate}
            disabled={!playbackUrl || busy}
            isPlaying={isPlaying}
            onTogglePlay={() => void togglePlayback()}
            onStepBack={() => stepClip(-1)}
            onStepForward={() => stepClip(1)}
            onSeekBack={() => nudgePlayhead(-SEEK_STEP_MS)}
            onSeekForward={() => nudgePlayhead(SEEK_STEP_MS)}
            onFrameBack={() => frameStep(-1)}
            onFrameForward={() => frameStep(1)}
          />

        </section>

        <CutEditorRail
          side="right"
          title="Clip"
          open={rightRailOpen}
          onClose={() => setRightOpen(false)}
        >
          <CutClipInspector
            clip={selectedAudioClipId ? null : activeClip ?? null}
            busy={busy}
            onApplyTrim={(sceneId, startMs, endMs) =>
              void patchTimeline({ action: 'trim', sceneId, startMs, endMs })
            }
          />
          {selectedAudioClipId ? (
            <div className="videon-nle__inspector-body">
              <Text role="label">Voice-Over Clip</Text>
              <Text role="meta">
                {timelineAudioClips.find((clip) => clip.id === selectedAudioClipId)?.label ?? selectedAudioClipId}
              </Text>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void patchTimeline({ action: 'deleteAudioClip', audioClipId: selectedAudioClipId })}
              >
                Voice-Over löschen
              </Button>
            </div>
          ) : null}
          <div className="videon-nle__inspector-body">
            <Text role="label">Canvas</Text>
            <Text role="meta">
              {cut.width && cut.height ? `${cut.width}×${cut.height}` : 'Standard'} · {aspectPreset}
            </Text>
          </div>
        </CutEditorRail>
      </div>

      <footer className="videon-nle__timeline-dock">
        <CutTimeline
          clips={clips}
          activeIndex={activeIndex}
          cutPlayheadMs={cutPlayheadMs}
          totalDurationMs={totalDurationMs}
          transcriptSegments={transcriptSegments}
          v2TranscriptSegments={v2TranscriptSegments}
          trimMode={trimMode}
          disabled={busy}
          platformProjectId={platformProjectId}
          playbackUrlByMediaId={playbackUrlByMediaId}
          voicePeaksByMediaId={voicePeaksByMediaId}
          musicPeaksByMediaId={musicPeaksByMediaId}
          mixPeaksByMediaId={mixPeaksByMediaId}
          sourceDurationMsByMediaId={sourceDurationMsByMediaId}
          audioClips={timelineAudioClips}
          videoClips={timelineVideoClips}
          audioBusLabel={audioBusTrack?.name ?? 'Voice-Over'}
          audioBusMuted={Boolean(audioBusTrack?.muted)}
          videoOverlayMuted={Boolean(videoOverlayTrack?.muted)}
          selectedAudioClipId={selectedAudioClipId}
          selectedVideoClipId={selectedVideoClipId}
          onSelectClip={(index) => {
            setSelectedAudioClipId(null)
            setSelectedVideoClipId(null)
            setActiveIndex(index)
            setRightOpen(true)
          }}
          onSeek={seekToCutMs}
          onReorder={(sceneIds) => void patchTimeline({ action: 'reorder', sceneIds })}
          onMoveClip={(sceneId, timelineStartMs) =>
            void patchTimeline({ action: 'moveScene', sceneId, timelineStartMs })
          }
          onMoveClipLane={(input) =>
            void patchTimeline({
              action: 'moveClipLane',
              fromLane: input.fromLane,
              toLane: input.toLane,
              clipId: input.clipId,
              timelineStartMs: input.timelineStartMs,
            })
          }
          onTrim={(sceneId, startMs, endMs, timelineStartMs) =>
            void patchTimeline({
              action: 'trim',
              sceneId,
              startMs,
              endMs,
              ...(typeof timelineStartMs === 'number' ? { timelineStartMs } : {}),
            })
          }
          onRollTrim={(leftSceneId, boundaryMs) =>
            void patchTimeline({ action: 'rollTrim', leftSceneId, boundaryMs })
          }
          onDropMedia={(payload) => void patchTimeline({ action: 'addScene', ...payload })}
          onDropVideoOverlay={(payload) =>
            void patchTimeline({
              action: 'addVideoClip',
              mediaAssetId: payload.mediaAssetId,
              startMs: payload.startMs,
              endMs: payload.endMs,
              timelineStartMs: payload.timelineStartMs,
            })
          }
          onDropAudioBus={(payload) =>
            void patchTimeline({
              action: 'addAudioClip',
              mediaAssetId: payload.mediaAssetId,
              startMs: payload.startMs,
              endMs: payload.endMs,
              timelineStartMs: payload.timelineStartMs,
            })
          }
          onSelectAudioClip={(clipId) => {
            setSelectedAudioClipId(clipId)
            if (clipId) {
              setSelectedVideoClipId(null)
              setRightOpen(true)
            }
          }}
          onSelectVideoClip={(clipId) => {
            setSelectedVideoClipId(clipId)
            if (clipId) {
              setSelectedAudioClipId(null)
              setRightOpen(true)
            }
          }}
          onMoveAudioClip={(clipId, timelineStartMs) =>
            void patchTimeline({ action: 'moveAudioClip', audioClipId: clipId, timelineStartMs })
          }
          onMoveVideoClip={(clipId, timelineStartMs) =>
            void patchTimeline({ action: 'moveVideoClip', videoClipId: clipId, timelineStartMs })
          }
          onTrimVideoClip={(clipId, startMs, endMs, timelineStartMs) =>
            void patchTimeline({
              action: 'trimVideoClip',
              videoClipId: clipId,
              startMs,
              endMs,
              ...(typeof timelineStartMs === 'number' ? { timelineStartMs } : {}),
            })
          }
          onDeleteAudioClip={(clipId) => void patchTimeline({ action: 'deleteAudioClip', audioClipId: clipId })}
          onDeleteVideoClip={(clipId) => void patchTimeline({ action: 'deleteVideoClip', videoClipId: clipId })}
          onToggleAudioBusMuted={() => {
            if (!audioBusTrack) return
            void patchTimeline({
              action: 'setTrackMuted',
              trackId: audioBusTrack.id,
              muted: !audioBusTrack.muted,
            })
          }}
          onToggleVideoOverlayMuted={() => {
            if (!videoOverlayTrack) return
            void patchTimeline({
              action: 'setTrackMuted',
              trackId: videoOverlayTrack.id,
              muted: !videoOverlayTrack.muted,
            })
          }}
          onContextMenuRequest={openTimelineContextMenu}
          onTrackMutesChange={setTrackMutes}
          hasStemAudio={hasStemAudio}
        />
      </footer>


      <div className="videon-nle__layer">
      <ContextMenu
        open={Boolean(timelineMenu)}
        x={timelineMenu?.x ?? 0}
        y={timelineMenu?.y ?? 0}
        onClose={closeTimelineContextMenu}
        items={timelineContextItems}
        label="Cut-Timeline-Kontextmenü"
      />
      {showShortcuts ? (
        <div className="videon-nle__shortcuts-panel" role="dialog" aria-label="Tastaturkürzel">
          <div className="videon-nle__shortcuts-panel-header">
            <strong>Tastaturkürzel</strong>
            <ToolButton label="Schließen" onClick={() => setShowShortcuts(false)}>
              ✕
            </ToolButton>
          </div>
          <ul>
            <li>
              <kbd>Space</kbd> / <kbd>K</kbd> Play/Pause
            </li>
            <li>
              <kbd>J</kbd> / <kbd>L</kbd> ±1 s · <kbd>,</kbd> / <kbd>.</kbd> Frame
            </li>
            <li>
              <kbd>S</kbd> Teilen · <kbd>⌫</kbd> Clip löschen
            </li>
            <li>
              <kbd>⌘Z</kbd> Undo · <kbd>⌘⇧Z</kbd> Redo
            </li>
            <li>
              <kbd>F</kbd> Vollbild · <kbd>?</kbd> Hilfe · <kbd>Esc</kbd> schließen
            </li>
            <li>Mausrad Jog · Mediathek in Timeline ziehen · Rechtsklick Kontextmenü</li>
          </ul>
        </div>
      ) : null}
      </div>
    </div>
  )
}
