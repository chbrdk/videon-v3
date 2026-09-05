'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Text } from '@msqdx/ui'
import { CutTimeline } from '@/components/cut-timeline'
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
import { useEditorKeyboard } from '@/lib/use-editor-keyboard'
import { paths } from '@/lib/paths'

type Clip = {
  scene: { id: string; position: number; startMs: number; endMs: number; mediaAssetId: string }
  media: { id: string; originalFilename: string; mimeType: string } | null
}

type CutDetail = {
  id: string
  name: string
  status: string
}

type LibraryMedia = {
  id: string
  originalFilename: string
  lifecycleState: string
  durationMs?: number | null
}

const SEEK_STEP_MS = 1000

function formatClock(ms: number): string {
  const totalSeconds = Math.max(ms, 0) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

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
  const [cut, setCut] = useState<CutDetail | null>(null)
  const [clips, setClips] = useState<Clip[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [cutPlayheadMs, setCutPlayheadMs] = useState(0)
  cutPlayheadRef.current = cutPlayheadMs
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [transcriptsByMediaId, setTranscriptsByMediaId] = useState<Record<string, TranscriptSegment[]>>({})
  const [libraryMedia, setLibraryMedia] = useState<LibraryMedia[]>([])
  const [selectedMediaId, setSelectedMediaId] = useState('')
  const [undoStack, setUndoStack] = useState<CutEditorSnapshot[]>([])
  const [redoStack, setRedoStack] = useState<CutEditorSnapshot[]>([])

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
    async (clip: Clip) => {
      if (!clip.media) {
        setPlaybackUrl(null)
        return
      }
      const response = await fetch(paths.routes.apiMediaPlayback(clip.media.id, platformProjectId), {
        cache: 'no-store',
      })
      const body = (await response.json()) as { playbackUrl?: string; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Wiedergabe nicht verfügbar')
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
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Cut nicht verfügbar'))
    void loadLibrary().catch(() => {})
  }, [load, loadLibrary])

  useEffect(() => {
    const clip = clips[activeIndex]
    if (!clip) return
    void loadPlayback(clip).catch((err) => setError(err instanceof Error ? err.message : 'Wiedergabe fehlgeschlagen'))
  }, [clips, activeIndex, loadPlayback])

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
    }
    const onPause = () => {
      playingRef.current = false
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

  const activeClip = clips[activeIndex]
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
    <div className="videon-editor">
      <header className="videon-editor__header">
        <div>
          <Text role="headline" as="h2">
            {cut.name}
          </Text>
          <Text role="meta" as="p">
            {clips.length} Clip{clips.length === 1 ? '' : 's'} · Playhead {formatClock(cutPlayheadMs)}
          </Text>
        </div>
        <div className="videon-editor__actions">
          <Button type="button" variant="ghost" disabled={busy || !canUndo} onClick={undo}>
            Rückgängig
          </Button>
          <Button type="button" variant="ghost" disabled={busy || !canRedo} onClick={redo}>
            Wiederholen
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !splitTarget}
            onClick={() =>
              void patchTimeline({
                action: 'split',
                sceneId: splitTarget?.sceneId,
                atMs: splitTarget?.atMs,
              })
            }
          >
            An Playhead teilen
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !activeClip || activeIndex >= clips.length - 1}
            onClick={() => void patchTimeline({ action: 'merge', sceneId: activeClip?.scene.id })}
          >
            Mit nächstem verbinden
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || clips.length <= 1 || !activeClip}
            onClick={() => void patchTimeline({ action: 'delete', sceneId: activeClip?.scene.id })}
          >
            Clip löschen
          </Button>
          <Button type="button" variant="ghost" onClick={() => void deleteCut()} disabled={busy}>
            Archivieren
          </Button>
        </div>
      </header>

      <p className="videon-editor__shortcuts">
        Leertaste Play/Pause · J/L ±1s · ←/→ Clip · Shift+←/→ fein · S Teilen · Entf Löschen · ⌘Z / ⌘⇧Z
      </p>

      {error ? <Text role="body">{error}</Text> : null}

      <div className="videon-editor__player-wrap">
        {playbackUrl ? (
          <video ref={videoRef} className="videon-editor__video" src={playbackUrl} controls playsInline />
        ) : (
          <div className="videon-editor__video-placeholder">
            <Text role="body">Keine Wiedergabe für diesen Clip</Text>
          </div>
        )}
      </div>

      <div className="videon-editor__transport">
        <Button type="button" variant="ghost" disabled={!playbackUrl || activeIndex <= 0} onClick={() => stepClip(-1)}>
          Vorheriger Clip
        </Button>
        <Button type="button" variant="ghost" disabled={!playbackUrl} onClick={() => void togglePlayback()}>
          Play/Pause
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={!playbackUrl || activeIndex >= clips.length - 1}
          onClick={() => stepClip(1)}
        >
          Nächster Clip
        </Button>
        <Text role="meta">
          {formatClock(cutPlayheadMs)} / {formatClock(totalDurationMs)}
        </Text>
      </div>

      <CutTimeline
        clips={clips}
        activeIndex={activeIndex}
        cutPlayheadMs={cutPlayheadMs}
        totalDurationMs={totalDurationMs}
        transcriptSegments={transcriptSegments}
        disabled={busy}
        onSelectClip={setActiveIndex}
        onSeek={seekToCutMs}
        onReorder={(sceneIds) => void patchTimeline({ action: 'reorder', sceneIds })}
        onTrim={(sceneId, startMs, endMs) => void patchTimeline({ action: 'trim', sceneId, startMs, endMs })}
      />

      <div className="videon-editor__add-clip">
        <label>
          <Text role="meta" as="span">
            Clip aus Mediathek
          </Text>
          <select value={selectedMediaId} onChange={(event) => setSelectedMediaId(event.target.value)} disabled={busy}>
            <option value="">Video wählen …</option>
            {libraryMedia.map((media) => (
              <option key={media.id} value={media.id}>
                {media.originalFilename}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="ghost" disabled={busy || !selectedMediaId} onClick={() => void addSelectedMedia()}>
          Nach aktivem Clip einfügen
        </Button>
      </div>

      <ul className="videon-editor__scene-list">
        {clips.map((clip, index) => (
          <li key={clip.scene.id}>
            <button
              type="button"
              className={`videon-editor__scene-button${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => {
                setActiveIndex(index)
                const item = timeline[index]
                if (item) seekToCutMs(item.cutStartMs)
              }}
            >
              <Text role="headline" as="span">
                Clip {index + 1}: {clip.media?.originalFilename ?? 'Unbekannt'}
              </Text>
              <Text role="meta" as="span">
                {formatClock(clip.scene.startMs)} – {formatClock(clip.scene.endMs)} · Cut{' '}
                {formatClock(timeline[index]?.cutStartMs ?? 0)} –{' '}
                {formatClock(timeline[index]?.cutEndMs ?? 0)}
              </Text>
            </button>
          </li>
        ))}
      </ul>

      {activeClip?.media ? (
        <Link href={paths.routes.mediaFor(activeClip.media.id, platformProjectId)}>
          <Button variant="ghost">Quellvideo im Editor öffnen</Button>
        </Link>
      ) : null}
    </div>
  )
}
