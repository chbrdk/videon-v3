'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Text } from '@msqdx/ui'
import { CutTimeline, MEDIA_DRAG_TYPE } from '@/components/cut-timeline'
import { EditorMonitor } from '@/components/editor-monitor'
import { EditorSideDrawer, toggleSidePanel, type EditorSidePanel } from '@/components/editor-side-drawer'
import {
  buildCutTimeline,
  cutPlayheadForSourceMs,
  cutTotalDurationMs,
  mapTranscriptToCutTimeline,
  splitSourceMsForCutPlayhead,
  type TranscriptSegment,
} from '@/lib/cut-timeline'
import {
  snapshotFromClips,
  type CutEditorSnapshot,
} from '@/lib/cut-editor-history'
import { EditorTransport } from '@/components/editor-transport'
import { IconRedo, IconSplit, IconUndo } from '@/components/editor-icons'
import { writeStoredActiveCut } from '@/lib/active-cut'
import { frameDurationMs, formatClock } from '@/lib/editor-time'
import type { TrimMode } from '@/lib/trim-modes'
import { paths } from '@/lib/paths'
import { useEditorKeyboard } from '@/lib/use-editor-keyboard'
import { prefetchWaveformPeaks } from '@/lib/use-waveform'

type Clip = {
  scene: { id: string; position: number; startMs: number; endMs: number; mediaAssetId: string }
  media: { id: string; originalFilename: string; mimeType: string; durationMs?: number | null } | null
}

type CutDetail = {
  id: string
  name: string
  status: string
  frameRate?: number | null
}

type LibraryMedia = {
  id: string
  originalFilename: string
  lifecycleState: string
  durationMs?: number | null
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
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cutPlayheadRef = useRef(0)
  const playingRef = useRef(false)
  const restoringRef = useRef(false)
  const playbackCacheRef = useRef<Map<string, string>>(new Map())
  const currentMediaIdRef = useRef<string | null>(null)
  const [cut, setCut] = useState<CutDetail | null>(null)
  const [clips, setClips] = useState<Clip[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [cutPlayheadMs, setCutPlayheadMs] = useState(0)
  cutPlayheadRef.current = cutPlayheadMs
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sidePanel, setSidePanel] = useState<EditorSidePanel | null>(null)
  const [transcriptsByMediaId, setTranscriptsByMediaId] = useState<Record<string, TranscriptSegment[]>>({})
  const [libraryMedia, setLibraryMedia] = useState<LibraryMedia[]>([])
  const [selectedMediaId, setSelectedMediaId] = useState('')
  const [undoStack, setUndoStack] = useState<CutEditorSnapshot[]>([])
  const [redoStack, setRedoStack] = useState<CutEditorSnapshot[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [trimMode, setTrimMode] = useState<TrimMode>('trim')
  const [playbackUrlByMediaId, setPlaybackUrlByMediaId] = useState<Record<string, string>>({})
  const [peaksByUrl, setPeaksByUrl] = useState<Record<string, number[]>>({})

  const timeline = useMemo(
    () =>
      buildCutTimeline(
        clips.map((clip) => ({
          id: clip.scene.id,
          position: clip.scene.position,
          mediaAssetId: clip.scene.mediaAssetId,
          startMs: clip.scene.startMs,
          endMs: clip.scene.endMs,
        })),
      ),
    [clips],
  )
  const totalDurationMs = useMemo(
    () =>
      cutTotalDurationMs(
        clips.map((clip) => ({
          id: clip.scene.id,
          position: clip.scene.position,
          mediaAssetId: clip.scene.mediaAssetId,
          startMs: clip.scene.startMs,
          endMs: clip.scene.endMs,
        })),
      ),
    [clips],
  )
  const transcriptSegments = useMemo(
    () => mapTranscriptToCutTimeline(timeline, transcriptsByMediaId),
    [timeline, transcriptsByMediaId],
  )
  const sourceDurationMsByMediaId = useMemo(() => {
    const next: Record<string, number> = {}
    for (const clip of clips) {
      if (!clip.media) continue
      const duration = clip.media.durationMs ?? clip.scene.endMs
      next[clip.media.id] = Math.max(next[clip.media.id] ?? 0, duration)
    }
    return next
  }, [clips])
  const activeClip = clips[activeIndex]

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
      error?: { message?: string }
    }
    if (!response.ok) throw new Error(body.error?.message || 'Cut konnte nicht geladen werden')
    setCut(body.cut ?? null)
    if (body.cut) {
      writeStoredActiveCut({
        cutId: body.cut.id,
        platformProjectId,
        name: body.cut.name,
      })
    }
    setClips(body.clips ?? [])
    setTranscriptsByMediaId(body.transcripts ?? {})
    setActiveIndex((current) => Math.min(current, Math.max((body.clips?.length ?? 1) - 1, 0)))
  }, [cutId, platformProjectId])

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
      const response = await fetch(paths.routes.apiMediaPlayback(clip.media.id, platformProjectId), {
        cache: 'no-store',
      })
      const body = (await response.json()) as { playbackUrl?: string; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Wiedergabe nicht verfügbar')
      playbackCacheRef.current.set(mediaId, body.playbackUrl ?? '')
      currentMediaIdRef.current = mediaId
      setPlaybackUrl(body.playbackUrl ?? null)
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
      const body = (await response.json()) as { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Timeline-Änderung fehlgeschlagen')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Timeline-Änderung fehlgeschlagen')
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
      setError(err instanceof Error ? err.message : 'Rückgängig fehlgeschlagen')
    } finally {
      restoringRef.current = false
      setBusy(false)
    }
  }

  const seekToCutMs = useCallback(
    (cutMs: number) => {
      const clamped = Math.max(0, Math.min(cutMs, totalDurationMs))
      setCutPlayheadMs(clamped)
      const item = timeline.find((entry) => clamped >= entry.cutStartMs && clamped < entry.cutEndMs) ?? timeline.at(-1)
      if (!item) return
      setActiveIndex(item.index)
      const sourceMs = item.scene.startMs + (clamped - item.cutStartMs)
      const video = videoRef.current
      if (video && !Number.isNaN(video.duration)) {
        video.currentTime = sourceMs / 1000
      }
    },
    [timeline, totalDurationMs],
  )

  useEffect(() => {
    const mediaIds = [...new Set(clips.map((clip) => clip.scene.mediaAssetId))]
    if (mediaIds.length === 0) {
      setPlaybackUrlByMediaId({})
      return
    }
    let cancelled = false
    void Promise.all(
      mediaIds.map(async (mediaId) => {
        if (playbackCacheRef.current.has(mediaId)) {
          return { mediaId, url: playbackCacheRef.current.get(mediaId) ?? '' }
        }
        const response = await fetch(paths.routes.apiMediaPlayback(mediaId, platformProjectId), { cache: 'no-store' })
        const body = (await response.json()) as { playbackUrl?: string }
        if (body.playbackUrl) playbackCacheRef.current.set(mediaId, body.playbackUrl)
        return { mediaId, url: body.playbackUrl ?? '' }
      }),
    ).then((entries) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const entry of entries) {
        if (entry.url) next[entry.mediaId] = entry.url
      }
      setPlaybackUrlByMediaId(next)
    })
    return () => {
      cancelled = true
    }
  }, [clips, platformProjectId])

  useEffect(() => {
    const urls = [...new Set(Object.values(playbackUrlByMediaId))]
    if (urls.length === 0) {
      setPeaksByUrl({})
      return
    }
    let cancelled = false
    void Promise.all(
      urls.map(async (url) => {
        const peaks = await prefetchWaveformPeaks(url)
        return [url, peaks] as const
      }),
    ).then((entries) => {
      if (cancelled) return
      setPeaksByUrl(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [playbackUrlByMediaId])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Cut nicht verfügbar'))
    void loadLibrary().catch(() => {})
  }, [load, loadLibrary])

  useEffect(() => {
    const clip = clips[activeIndex]
    if (!clip) return
    const mediaId = clip.media?.id ?? null
    if (mediaId && currentMediaIdRef.current === mediaId && playbackUrl) return
    void loadPlayback(clip).catch((err) => setError(err instanceof Error ? err.message : 'Wiedergabe fehlgeschlagen'))
  }, [clips, activeIndex, loadPlayback, playbackUrl])

  useEffect(() => {
    const video = videoRef.current
    const clip = clips[activeIndex]
    const item = timeline[activeIndex]
    if (!video || !clip || !item || !playbackUrl) return

    const onLoaded = () => {
      const playhead = cutPlayheadRef.current
      video.currentTime = (clip.scene.startMs + Math.max(playhead - item.cutStartMs, 0)) / 1000
      if (playingRef.current) void video.play().catch(() => {})
    }
    const onTime = () => {
      const sourceMs = Math.floor(video.currentTime * 1000)
      const nextCutMs = cutPlayheadForSourceMs(timeline, clip.scene.id, sourceMs)
      setCutPlayheadMs(nextCutMs)
      if (sourceMs >= clip.scene.endMs - 50) {
        if (activeIndex + 1 < clips.length) {
          setActiveIndex(activeIndex + 1)
        } else {
          playingRef.current = false
          video.pause()
        }
      }
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
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    onLoaded()
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [clips, activeIndex, playbackUrl, timeline])

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
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
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
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

  const addSelectedMedia = async () => {
    if (!selectedMediaId) return
    const media = libraryMedia.find((item) => item.id === selectedMediaId)
    if (!media) return
    let endMs = media.durationMs ?? 0
    if (!endMs) {
      const response = await fetch(paths.routes.apiMediaDetail(media.id, platformProjectId), { cache: 'no-store' })
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
    setSelectedMediaId('')
  }

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

  if (error && !cut) {
    return (
      <div className="videon-editor-error">
        <Text role="title">Cut nicht verfügbar</Text>
        <Text role="body">{error}</Text>
      </div>
    )
  }

  if (!cut) return <Text role="body">Cut wird geladen …</Text>

  return (
    <div className="videon-nle videon-nle--player-first">
      <header className="videon-nle__toolbar">
        <div className="videon-nle__toolbar-title">
          <h2>{cut.name}</h2>
          <p className="videon-nle__toolbar-meta">
            Cut · {clips.length} Clip{clips.length === 1 ? '' : 's'} · {cut.status}
          </p>
        </div>
        <div className="videon-nle__panel-tabs">
          <button
            type="button"
            className={`videon-nle__tool-btn${sidePanel === 'bin' ? ' is-active' : ''}`}
            onClick={() => setSidePanel((current) => toggleSidePanel(current, 'bin'))}
          >
            Bin ({clips.length})
          </button>
        </div>
        <div className="videon-nle__toolbar-groups">
          <div className="videon-nle__tool-group">
            <button type="button" className="videon-nle__tool-btn" disabled={busy || !canUndo} onClick={undo} title="Rückgängig (⌘Z)" aria-label="Rückgängig">
              <IconUndo />
            </button>
            <button type="button" className="videon-nle__tool-btn" disabled={busy || !canRedo} onClick={redo} title="Wiederholen (⌘⇧Z)" aria-label="Wiederholen">
              <IconRedo />
            </button>
          </div>
          <div className="videon-nle__tool-group">
            {(['trim', 'ripple', 'roll'] as TrimMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`videon-nle__tool-btn${trimMode === mode ? ' is-active' : ''}`}
                onClick={() => setTrimMode(mode)}
                title={`Trim-Modus: ${mode}`}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="videon-nle__tool-group">
            <button
              type="button"
              className="videon-nle__tool-btn"
              disabled={busy || !splitTarget}
              title="An Playhead teilen (S)"
              aria-label="An Playhead teilen"
              onClick={() =>
                void patchTimeline({
                  action: 'split',
                  sceneId: splitTarget?.sceneId,
                  atMs: splitTarget?.atMs,
                })
              }
            >
              <IconSplit />
            </button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || !activeClip || activeIndex >= clips.length - 1}
              onClick={() => void patchTimeline({ action: 'merge', sceneId: activeClip?.scene.id })}
            >
              Verbinden
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || clips.length <= 1 || !activeClip}
              onClick={() => void patchTimeline({ action: 'delete', sceneId: activeClip?.scene.id })}
            >
              Löschen
            </Button>
          </div>
          <Button type="button" variant="ghost" onClick={() => void deleteCut()} disabled={busy}>
            Archivieren
          </Button>
        </div>
      </header>

      {error ? <p className="videon-nle__error">{error}</p> : null}

      <div className="videon-nle__workspace">
        <section className="videon-nle__program">
          <EditorMonitor
            label="Programm"
            videoRef={videoRef}
            playbackUrl={playbackUrl}
            frameMs={frameDurationMs(cut.frameRate)}
            disabled={!playbackUrl || busy}
            onSeekDelta={(deltaMs) => nudgePlayhead(deltaMs)}
            hud={
              activeClip ? (
                <div className="videon-nle__monitor-scene">
                  <span className="videon-nle__monitor-scene-time">
                    V1 · {formatClock(activeClip.scene.startMs)} – {formatClock(activeClip.scene.endMs)}
                  </span>
                  <p className="videon-nle__monitor-scene-text">
                    {activeClip.media?.originalFilename ?? `Clip ${activeIndex + 1}`}
                  </p>
                </div>
              ) : null
            }
          >
            {playbackUrl ? (
              <video ref={videoRef} className="videon-nle__video" src={playbackUrl} playsInline preload="metadata" />
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
      </div>

      <EditorSideDrawer open={sidePanel === 'bin'} title="Projekt-Bin" onClose={() => setSidePanel(null)}>
        <div className="videon-nle__field-row">
          <Text role="meta" as="span">
            Clip einfügen
          </Text>
          <select value={selectedMediaId} onChange={(event) => setSelectedMediaId(event.target.value)} disabled={busy}>
            <option value="">Video wählen …</option>
            {libraryMedia.map((media) => (
              <option key={media.id} value={media.id}>
                {media.originalFilename}
              </option>
            ))}
          </select>
          <Button type="button" variant="ghost" disabled={busy || !selectedMediaId} onClick={() => void addSelectedMedia()}>
            Nach aktivem Clip einfügen
          </Button>
        </div>

        <Text role="meta" as="span">
          Mediathek · in Timeline ziehen
        </Text>
        <ul className="videon-editor__scene-list">
          {libraryMedia.map((media) => (
            <li key={media.id}>
              <button
                type="button"
                className="videon-nle__bin-item videon-nle__bin-item--draggable"
                draggable={!busy}
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    MEDIA_DRAG_TYPE,
                    JSON.stringify({
                      mediaAssetId: media.id,
                      startMs: 0,
                      endMs: media.durationMs ?? 60_000,
                    }),
                  )
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => setSelectedMediaId(media.id)}
              >
                <span className="videon-nle__bin-item-title">{media.originalFilename}</span>
                <span className="videon-nle__bin-item-meta">Ziehen oder klicken zum Auswählen</span>
              </button>
            </li>
          ))}
        </ul>

        <ul className="videon-editor__scene-list">
          {clips.map((clip, index) => (
            <li key={clip.scene.id}>
              <button
                type="button"
                className={`videon-nle__bin-item${index === activeIndex ? ' is-active' : ''}`}
                onClick={() => {
                  setActiveIndex(index)
                  const item = timeline[index]
                  if (item) seekToCutMs(item.cutStartMs)
                }}
              >
                <span className="videon-nle__bin-item-title">V1 · {clip.media?.originalFilename ?? 'Unbekannt'}</span>
                <span className="videon-nle__bin-item-meta">
                  {formatClock(clip.scene.startMs)} – {formatClock(clip.scene.endMs)} · Cut{' '}
                  {formatClock(timeline[index]?.cutStartMs ?? 0)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {activeClip?.media ? (
          <Link href={paths.routes.mediaFor(activeClip.media.id, platformProjectId)}>
            <Button variant="ghost">Quellvideo öffnen</Button>
          </Link>
        ) : null}
      </EditorSideDrawer>

      <footer className="videon-nle__timeline-dock">
        <CutTimeline
          clips={clips}
          activeIndex={activeIndex}
          cutPlayheadMs={cutPlayheadMs}
          totalDurationMs={totalDurationMs}
          transcriptSegments={transcriptSegments}
          trimMode={trimMode}
          disabled={busy}
          playbackUrlByMediaId={playbackUrlByMediaId}
          peaksByUrl={peaksByUrl}
          sourceDurationMsByMediaId={sourceDurationMsByMediaId}
          onSelectClip={setActiveIndex}
          onSeek={seekToCutMs}
          onReorder={(sceneIds) => void patchTimeline({ action: 'reorder', sceneIds })}
          onTrim={(sceneId, startMs, endMs) => void patchTimeline({ action: 'trim', sceneId, startMs, endMs })}
          onRollTrim={(leftSceneId, boundaryMs) =>
            void patchTimeline({ action: 'rollTrim', leftSceneId, boundaryMs })
          }
          onDropMedia={(payload) => void patchTimeline({ action: 'addScene', ...payload })}
        />
      </footer>

      <p className="videon-nle__shortcuts" hidden>
        Mausrad Jog · Shift+Mausrad ±1s · Vollbild am Monitor · Trim/Ripple/Roll · Mediathek in Timeline ziehen · S Teilen · ⌘Z
      </p>
    </div>
  )
}
