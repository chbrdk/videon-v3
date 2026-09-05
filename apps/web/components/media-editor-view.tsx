'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Text } from '@msqdx/ui'
import { useActiveCollection } from '@/components/collection-context'
import { EditorMonitor } from '@/components/editor-monitor'
import { MediaSearch } from '@/components/media-search'
import { TimelineWaveform } from '@/components/timeline-waveform'
import { readStoredActiveCut, type ActiveCutContext } from '@/lib/active-cut'
import { EditorTransport } from '@/components/editor-transport'
import { frameDurationMs, formatClock, normalizeInOutRange } from '@/lib/editor-time'
import { useEditorKeyboard } from '@/lib/use-editor-keyboard'
import { useWaveformPeaks } from '@/lib/use-waveform'
import { PipelineStatusTrack } from '@/components/pipeline-status-track'
import type { PipelineStageSnapshot } from '@/lib/pipeline/pipeline-status'

type SceneItem = {
  sceneKey: string
  startMs: number
  endMs: number
  insight: {
    summary: string
    mood: string[]
    setting?: { location: string; timeOfDay: string }
    subjects?: Array<{ label: string }>
  }
}

type MediaDetail = {
  id: string
  originalFilename: string
  mimeType: string
  bytes: number
  lifecycleState: string
  durationMs: number | null
  width: number | null
  height: number | null
  frameRate?: number | null
}

type AnalysisState = {
  id: string
  status: string
  startedAt?: string | null
  finishedAt?: string | null
} | null

type StageState = PipelineStageSnapshot

type TranscriptState = {
  status: string
  transcriptText: string | null
  segments?: Array<{ startMs: number; endMs: number; text: string }>
} | null

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MediaEditorView({
  platformProjectId,
  mediaAssetId,
}: {
  platformProjectId: string
  mediaAssetId: string
}) {
  const router = useRouter()
  const { setPlatformProjectId } = useActiveCollection()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [media, setMedia] = useState<MediaDetail | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisState>(null)
  const [stages, setStages] = useState<StageState[]>([])
  const [scenes, setScenes] = useState<SceneItem[]>([])
  const [transcript, setTranscript] = useState<TranscriptState>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [activeSceneKey, setActiveSceneKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [markInMs, setMarkInMs] = useState<number | null>(null)
  const [markOutMs, setMarkOutMs] = useState<number | null>(null)
  const [activeCut, setActiveCut] = useState<ActiveCutContext | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const { peaks: waveformPeaks } = useWaveformPeaks(playbackUrl)
  const markedRange = useMemo(
    () =>
      normalizeInOutRange({
        inMs: markInMs,
        outMs: markOutMs,
        durationMs: media?.durationMs ?? durationMs,
      }),
    [durationMs, markInMs, markOutMs, media?.durationMs],
  )

  const loadDetail = useCallback(async () => {
    const response = await fetch(paths.routes.apiMediaDetail(mediaAssetId, platformProjectId), {
      cache: 'no-store',
    })
    const body = (await response.json()) as {
      media?: MediaDetail
      analysis?: AnalysisState
      stages?: StageState[]
      scenes?: SceneItem[]
      transcript?: TranscriptState
      error?: { message?: string }
    }
    if (!response.ok) throw new Error(body.error?.message || 'Mediendetails konnten nicht geladen werden')
    setMedia(body.media ?? null)
    setAnalysis(body.analysis ?? null)
    setStages(body.stages ?? [])
    setScenes(body.scenes ?? [])
    setTranscript(body.transcript ?? null)
  }, [mediaAssetId, platformProjectId])

  const loadPlayback = useCallback(async () => {
    const response = await fetch(paths.routes.apiMediaPlayback(mediaAssetId, platformProjectId), {
      cache: 'no-store',
    })
    const body = (await response.json()) as { playbackUrl?: string; error?: { message?: string } }
    if (!response.ok) throw new Error(body.error?.message || 'Wiedergabe-URL konnte nicht geladen werden')
    setPlaybackUrl(body.playbackUrl ?? null)
  }, [mediaAssetId, platformProjectId])

  const refresh = useCallback(async () => {
    setError(null)
    try {
      await loadDetail()
      await loadPlayback()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [loadDetail, loadPlayback])

  useEffect(() => {
    setPlatformProjectId(platformProjectId)
    setActiveCut(readStoredActiveCut())
  }, [platformProjectId, setPlatformProjectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!analysis || (analysis.status !== 'queued' && analysis.status !== 'running')) return
    const timer = window.setInterval(() => {
      void loadDetail()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [analysis, loadDetail])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => {
      const ms = Math.floor(video.currentTime * 1000)
      setCurrentMs(ms)
      const scene = scenes.find((entry) => ms >= entry.startMs && ms < entry.endMs)
      setActiveSceneKey(scene?.sceneKey ?? null)
    }
    const onMeta = () => setDurationMs(Math.floor(video.duration * 1000))
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [scenes, playbackUrl])

  const seekTo = (ms: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = ms / 1000
    setCurrentMs(ms)
  }

  const stepScene = (delta: number) => {
    if (scenes.length === 0) return
    const currentIndex = scenes.findIndex((scene) => scene.sceneKey === activeSceneKey)
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const next = scenes[Math.min(Math.max(baseIndex + delta, 0), scenes.length - 1)]
    if (!next) return
    seekTo(next.startMs)
    setActiveSceneKey(next.sceneKey)
  }

  const nudgePlayhead = (deltaMs: number) => {
    seekTo(currentMs + deltaMs)
  }

  const frameStep = (direction: -1 | 1) => {
    nudgePlayhead(direction * frameDurationMs(media?.frameRate))
  }

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) await video.play()
    else video.pause()
  }

  const addRangeToActiveCut = async (startMs: number, endMs: number, targetMediaId = mediaAssetId) => {
    if (!activeCut || activeCut.platformProjectId !== platformProjectId) {
      setError('Öffne zuerst einen Cut im Cut-Editor, um Clips einzufügen.')
      return
    }
    setBusy('cut')
    setError(null)
    try {
      const response = await fetch(paths.routes.apiCutDetail(activeCut.cutId, platformProjectId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addScene',
          mediaAssetId: targetMediaId,
          startMs,
          endMs,
        }),
      })
      const body = (await response.json()) as { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Clip konnte nicht eingefügt werden')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clip konnte nicht eingefügt werden')
    } finally {
      setBusy(null)
    }
  }

  useEditorKeyboard({
    enabled: Boolean(media) && !busy,
    onTogglePlay: () => void togglePlayback(),
    onSeekBack: () => nudgePlayhead(-1000),
    onSeekForward: () => nudgePlayhead(1000),
    onStepBack: () => stepScene(-1),
    onStepForward: () => stepScene(1),
    onFrameBack: () => frameStep(-1),
    onFrameForward: () => frameStep(1),
    onMarkIn: () => setMarkInMs(currentMs),
    onMarkOut: () => setMarkOutMs(currentMs),
  })

  const rerunAnalysis = async () => {
    setBusy('analysis')
    setError(null)
    try {
      const response = await fetch(paths.routes.apiMediaAnalysis(mediaAssetId, platformProjectId), {
        method: 'POST',
      })
      const body = (await response.json()) as { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Analyse konnte nicht gestartet werden')
      await loadDetail()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse konnte nicht gestartet werden')
    } finally {
      setBusy(null)
    }
  }

  const saveAsCut = async (allScenes = false) => {
    if (!media) return
    const defaultName = media.originalFilename.replace(/\.[^.]+$/, '')
    const name = window.prompt('Name für den Cut', defaultName)
    if (!name?.trim()) return
    const activeScene = scenes.find((scene) => scene.sceneKey === activeSceneKey)
    const inOutRange = markedRange
    setBusy('cut')
    setError(null)
    try {
      const payload =
        allScenes && scenes.length > 0
          ? {
              platformProjectId,
              name: name.trim(),
              scenes: scenes.map((scene) => ({
                mediaAssetId: media.id,
                startMs: scene.startMs,
                endMs: scene.endMs,
              })),
            }
          : inOutRange
            ? {
                platformProjectId,
                name: name.trim(),
                mediaAssetId: media.id,
                startMs: inOutRange.startMs,
                endMs: inOutRange.endMs,
              }
            : {
                platformProjectId,
                name: name.trim(),
                mediaAssetId: media.id,
                startMs: activeScene?.startMs ?? 0,
                endMs: activeScene?.endMs ?? media.durationMs ?? durationMs,
              }
      const response = await fetch(paths.routes.apiCuts(platformProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await response.json()) as { cut?: { id: string }; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Cut konnte nicht erstellt werden')
      if (body.cut?.id) router.push(paths.routes.cutFor(body.cut.id, platformProjectId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cut konnte nicht erstellt werden')
    } finally {
      setBusy(null)
    }
  }

  const deleteMedia = async () => {
    if (!window.confirm('Video und alle Analysen endgültig löschen?')) return
    setBusy('delete')
    setError(null)
    try {
      const response = await fetch(paths.routes.apiMediaDetail(mediaAssetId, platformProjectId), {
        method: 'DELETE',
      })
      const body = (await response.json()) as { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Löschen fehlgeschlagen')
      router.push(paths.routes.libraryFor(platformProjectId))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <Text role="body">Editor wird geladen …</Text>
  }

  if (error && !media) {
    return (
      <div className="videon-editor-error">
        <Text role="title">Editor nicht verfügbar</Text>
        <Text role="body">{error}</Text>
        <Link href={paths.routes.libraryFor(platformProjectId)}>
          <Button variant="ghost">Zur Mediathek</Button>
        </Link>
      </div>
    )
  }

  if (!media) return null

  const timelineDuration = media.durationMs ?? durationMs ?? Math.max(...scenes.map((s) => s.endMs), 1)

  return (
    <div className="videon-nle">
      <header className="videon-nle__toolbar">
        <div className="videon-nle__toolbar-title">
          <h2>{media.originalFilename}</h2>
          <p className="videon-nle__toolbar-meta">
            Quelle · {media.mimeType} · {formatBytes(media.bytes)}
            {media.width && media.height ? ` · ${media.width}×${media.height}` : ''}
          </p>
        </div>
        <div className="videon-nle__toolbar-groups">
          <Button type="button" variant="ghost" onClick={() => void refresh()} disabled={Boolean(busy)}>
            Aktualisieren
          </Button>
          <Button type="button" variant="ghost" onClick={() => void saveAsCut(false)} disabled={Boolean(busy)}>
            {busy === 'cut' ? 'Speichert …' : markedRange ? 'In/Out als Cut' : 'Szene als Cut'}
          </Button>
          {markedRange && activeCut ? (
            <Button
              type="button"
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() => void addRangeToActiveCut(markedRange.startMs, markedRange.endMs)}
            >
              In/Out zum Cut
            </Button>
          ) : null}
          {scenes.length > 1 ? (
            <Button type="button" variant="ghost" onClick={() => void saveAsCut(true)} disabled={Boolean(busy)}>
              Alle Szenen als Cut
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => void rerunAnalysis()}
            disabled={Boolean(busy) || media.lifecycleState === 'uploading'}
          >
            {busy === 'analysis' ? 'Startet …' : 'Analyse'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void deleteMedia()} disabled={Boolean(busy)}>
            {busy === 'delete' ? 'Löscht …' : 'Löschen'}
          </Button>
        </div>
      </header>

      {error ? <p className="videon-nle__error">{error}</p> : null}

      <div className="videon-nle__workspace">
        <section className="videon-nle__program">
          <EditorMonitor
            label="Quellmonitor"
            videoRef={videoRef}
            playbackUrl={playbackUrl}
            frameMs={frameDurationMs(media.frameRate)}
            disabled={!playbackUrl || Boolean(busy)}
            onSeekDelta={(deltaMs) => nudgePlayhead(deltaMs)}
          >
            {playbackUrl ? (
              <video ref={videoRef} className="videon-nle__video" src={playbackUrl} playsInline preload="metadata" />
            ) : (
              <div className="videon-nle__video-placeholder">
                <Text role="body">Wiedergabe noch nicht verfügbar</Text>
              </div>
            )}
          </EditorMonitor>

          <EditorTransport
            currentMs={currentMs}
            durationMs={timelineDuration}
            frameRate={media.frameRate}
            disabled={!playbackUrl || Boolean(busy)}
            isPlaying={isPlaying}
            onTogglePlay={() => void togglePlayback()}
            onStepBack={() => stepScene(-1)}
            onStepForward={() => stepScene(1)}
            onSeekBack={() => nudgePlayhead(-1000)}
            onSeekForward={() => nudgePlayhead(1000)}
            onFrameBack={() => frameStep(-1)}
            onFrameForward={() => frameStep(1)}
            showMarks
            markInMs={markInMs}
            markOutMs={markOutMs}
            onMarkIn={() => setMarkInMs(currentMs)}
            onMarkOut={() => setMarkOutMs(currentMs)}
            onClearMarks={() => {
              setMarkInMs(null)
              setMarkOutMs(null)
            }}
          />

          <div className="videon-nle__waveform-slot">
            <TimelineWaveform
              peaks={waveformPeaks}
              durationMs={timelineDuration}
              playheadMs={currentMs}
              inMs={markInMs}
              outMs={markOutMs}
              label="Audio"
              onSeek={seekTo}
            />
          </div>
        </section>

        <aside className="videon-nle__inspector">
          <div className="videon-nle__inspector-header">Metadaten</div>
          <div className="videon-nle__inspector-body">
            <PipelineStatusTrack
              analysis={analysis}
              stages={stages}
              mediaLifecycleState={media.lifecycleState}
              showLifecycle
              variant="detailed"
            />

            <Text role="title" as="h3">
              Szenen
            </Text>
            {scenes.length === 0 ? (
              <Text role="body">
                {analysis?.status === 'running' || analysis?.status === 'queued'
                  ? 'Analyse läuft — Szenen erscheinen nach Abschluss.'
                  : 'Noch keine Szenen.'}
              </Text>
            ) : (
              <ul className="videon-editor__scene-list">
                {scenes.map((scene) => (
                  <li key={scene.sceneKey}>
                    <button
                      type="button"
                      className={`videon-nle__bin-item${activeSceneKey === scene.sceneKey ? ' is-active' : ''}`}
                      onClick={() => seekTo(scene.startMs)}
                    >
                      <span className="videon-nle__bin-item-title">{scene.insight.summary}</span>
                      <span className="videon-nle__bin-item-meta">
                        {formatClock(scene.startMs)} – {formatClock(scene.endMs)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Text role="title" as="h3">
              Suche & Cut
            </Text>
            <MediaSearch
              platformProjectId={platformProjectId}
              activeCutName={activeCut?.platformProjectId === platformProjectId ? activeCut.name : null}
              onAddToCut={async (hit) => {
                let startMs = hit.startMs ?? 0
                let endMs = hit.endMs ?? media?.durationMs ?? durationMs
                if ((!hit.startMs || !hit.endMs) && hit.mediaAssetId !== mediaAssetId) {
                  const response = await fetch(paths.routes.apiMediaDetail(hit.mediaAssetId, platformProjectId), {
                    cache: 'no-store',
                  })
                  const body = (await response.json()) as {
                    media?: { durationMs?: number | null }
                    scenes?: SceneItem[]
                  }
                  const scene = body.scenes?.find((entry) => entry.sceneKey === hit.sceneKey)
                  startMs = scene?.startMs ?? 0
                  endMs = scene?.endMs ?? body.media?.durationMs ?? 60_000
                } else if (hit.sceneKey && (!hit.startMs || !hit.endMs)) {
                  const scene = scenes.find((entry) => entry.sceneKey === hit.sceneKey)
                  startMs = scene?.startMs ?? 0
                  endMs = scene?.endMs ?? media?.durationMs ?? durationMs
                }
                await addRangeToActiveCut(startMs, endMs, hit.mediaAssetId)
              }}
            />

            {transcript?.segments?.length ? (
              <>
                <Text role="title" as="h3">
                  Transkript
                </Text>
                <ul className="videon-editor__stage-list">
                  {transcript.segments.map((segment) => (
                    <li key={`${segment.startMs}-${segment.endMs}`}>
                      <button type="button" className="videon-nle__bin-item" onClick={() => seekTo(segment.startMs)}>
                        <span className="videon-nle__bin-item-meta">
                          {formatClock(segment.startMs)} – {formatClock(segment.endMs)}
                        </span>
                        <span className="videon-nle__bin-item-title">{segment.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : transcript?.status === 'skipped' ? (
              <>
                <Text role="title" as="h3">
                  Transkript
                </Text>
                <Text role="body">Kein Transkript — keine Tonspur oder Transkription deaktiviert.</Text>
              </>
            ) : transcript?.status === 'failed' ? (
              <>
                <Text role="title" as="h3">
                  Transkript
                </Text>
                <Text role="body">Transkription fehlgeschlagen. Analyse erneut starten.</Text>
              </>
            ) : null}
          </div>
        </aside>
      </div>

      <footer className="videon-nle__timeline-dock">
        <div className="videon-cut-timeline__meta">
          <span className="videon-cut-timeline__title">Quell-Timeline</span>
          <Text role="meta">
            {formatClock(currentMs)} / {formatClock(timelineDuration)}
          </Text>
        </div>
        <div className="videon-editor__timeline videon-editor__timeline--dock" aria-label="Szenen-Timeline">
          {markedRange ? (
            <div
              className="videon-editor__range-marker"
              style={{
                left: `${(markedRange.startMs / timelineDuration) * 100}%`,
                width: `${((markedRange.endMs - markedRange.startMs) / timelineDuration) * 100}%`,
              }}
            />
          ) : null}
          {scenes.map((scene) => {
            const left = (scene.startMs / timelineDuration) * 100
            const width = Math.max(((scene.endMs - scene.startMs) / timelineDuration) * 100, 1.5)
            return (
              <button
                key={scene.sceneKey}
                type="button"
                className={`videon-editor__scene-marker${activeSceneKey === scene.sceneKey ? ' is-active' : ''}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                onClick={() => seekTo(scene.startMs)}
                title={scene.insight.summary}
              />
            )
          })}
          <div
            className="videon-cut-timeline__playhead"
            style={{ left: `${(currentMs / timelineDuration) * 100}%` }}
          />
        </div>
      </footer>

      <p className="videon-nle__shortcuts">
        Mausrad Jog · Shift+Mausrad ±1s · Vollbild am Monitor · I/O In/Out · Leertaste Play/Pause
      </p>
    </div>
  )
}
