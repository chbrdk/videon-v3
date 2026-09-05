'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Text } from '@msqdx/ui'
import { paths } from '@/lib/paths'

type SceneItem = {
  sceneKey: string
  startMs: number
  endMs: number
  insight: { summary: string; mood: string[] }
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
}

type AnalysisState = {
  id: string
  status: string
} | null

type StageState = {
  stageKey: string
  status: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(ms, 0) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function MediaEditorView({
  platformProjectId,
  mediaAssetId,
}: {
  platformProjectId: string
  mediaAssetId: string
}) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [media, setMedia] = useState<MediaDetail | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisState>(null)
  const [stages, setStages] = useState<StageState[]>([])
  const [scenes, setScenes] = useState<SceneItem[]>([])
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [activeSceneKey, setActiveSceneKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadDetail = useCallback(async () => {
    const response = await fetch(paths.routes.apiMediaDetail(mediaAssetId, platformProjectId), {
      cache: 'no-store',
    })
    const body = (await response.json()) as {
      media?: MediaDetail
      analysis?: AnalysisState
      stages?: StageState[]
      scenes?: SceneItem[]
      error?: { message?: string }
    }
    if (!response.ok) throw new Error(body.error?.message || 'Mediendetails konnten nicht geladen werden')
    setMedia(body.media ?? null)
    setAnalysis(body.analysis ?? null)
    setStages(body.stages ?? [])
    setScenes(body.scenes ?? [])
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
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadedmetadata', onMeta)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onMeta)
    }
  }, [scenes, playbackUrl])

  const seekTo = (ms: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = ms / 1000
    setCurrentMs(ms)
  }

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) await video.play()
    else video.pause()
  }

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
    <div className="videon-editor">
      <header className="videon-editor__header">
        <div>
          <Text role="headline" as="h2">
            {media.originalFilename}
          </Text>
          <Text role="meta" as="p">
            {media.mimeType} · {formatBytes(media.bytes)} · {media.lifecycleState}
            {media.width && media.height ? ` · ${media.width}×${media.height}` : ''}
          </Text>
        </div>
        <div className="videon-editor__actions">
          <Button type="button" variant="ghost" onClick={() => void refresh()} disabled={Boolean(busy)}>
            Aktualisieren
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void rerunAnalysis()}
            disabled={Boolean(busy) || media.lifecycleState === 'uploading'}
          >
            {busy === 'analysis' ? 'Startet …' : 'Analyse erneut starten'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void deleteMedia()} disabled={Boolean(busy)}>
            {busy === 'delete' ? 'Löscht …' : 'Löschen'}
          </Button>
        </div>
      </header>

      {error ? <Text role="body">{error}</Text> : null}

      <div className="videon-editor__player-wrap">
        {playbackUrl ? (
          <video
            ref={videoRef}
            className="videon-editor__video"
            src={playbackUrl}
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <div className="videon-editor__video-placeholder">
            <Text role="body">Wiedergabe noch nicht verfügbar</Text>
          </div>
        )}
      </div>

      <div className="videon-editor__transport">
        <Button type="button" variant="ghost" onClick={() => void togglePlayback()} disabled={!playbackUrl}>
          Play/Pause
        </Button>
        <Text role="meta">
          {formatClock(currentMs)} / {formatClock(timelineDuration)}
        </Text>
      </div>

      <div className="videon-editor__timeline" aria-label="Szenen-Timeline">
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
      </div>

      <div className="videon-editor__grid">
        <section className="videon-editor__panel">
          <Text role="title" as="h3">
            Szenen
          </Text>
          {scenes.length === 0 ? (
            <Text role="body">
              {analysis?.status === 'running' || analysis?.status === 'queued'
                ? 'Analyse läuft — Szenen erscheinen nach Abschluss.'
                : 'Noch keine Szenen. Starte eine Analyse, um Kapitel zu erhalten.'}
            </Text>
          ) : (
            <ul className="videon-editor__scene-list">
              {scenes.map((scene) => (
                <li key={scene.sceneKey}>
                  <button
                    type="button"
                    className={`videon-editor__scene-button${activeSceneKey === scene.sceneKey ? ' is-active' : ''}`}
                    onClick={() => seekTo(scene.startMs)}
                  >
                    <Text role="headline" as="span">
                      {formatClock(scene.startMs)} – {formatClock(scene.endMs)}
                    </Text>
                    <Text role="body" as="span">
                      {scene.insight.summary}
                    </Text>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="videon-editor__panel">
          <Text role="title" as="h3">
            Analyse
          </Text>
          <Text role="meta" as="p">
            Status: {analysis?.status ?? 'keine'}
          </Text>
          {stages.length > 0 ? (
            <ul className="videon-editor__stage-list">
              {stages.map((stage) => (
                <li key={stage.stageKey}>
                  <Text role="meta">
                    {stage.stageKey}: {stage.status}
                  </Text>
                </li>
              ))}
            </ul>
          ) : (
            <Text role="body">Pipeline-Stages erscheinen nach dem ersten Lauf.</Text>
          )}
        </section>
      </div>
    </div>
  )
}
