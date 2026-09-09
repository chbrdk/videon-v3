'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, EmptyState, Input, Text, ToolButton } from '@msqdx/ui'
import { MediaCardThumb } from '@/components/media-card-thumb'
import { MEDIA_DRAG_TYPE } from '@/components/cut-timeline'
import { formatClock } from '@/lib/editor-time'
import { paths } from '@/lib/paths'

export type CutBinMedia = {
  id: string
  originalFilename: string
  lifecycleState: string
  durationMs?: number | null
  sceneCount?: number
}

export type CutBinScene = {
  sceneKey: string
  startMs: number
  endMs: number
}

type CutBinPanelProps = {
  platformProjectId: string
  libraryMedia: CutBinMedia[]
  busy: boolean
  onAddWholeVideo: (mediaId: string) => void
  onAddVoiceOver: (mediaId: string) => void
  onAddScenes: (mediaId: string, scenes: CutBinScene[]) => void
}

function sceneLabel(count: number): string {
  if (count <= 0) return 'Keine Szenen'
  if (count === 1) return '1 Szene'
  return `${count} Szenen`
}

export function CutBinPanel({
  platformProjectId,
  libraryMedia,
  busy,
  onAddWholeVideo,
  onAddVoiceOver,
  onAddScenes,
}: CutBinPanelProps) {
  const [query, setQuery] = useState('')
  const [focusedMediaId, setFocusedMediaId] = useState<string | null>(null)
  const [binScenes, setBinScenes] = useState<CutBinScene[]>([])
  const [scenesLoading, setScenesLoading] = useState(false)

  const focusedMedia = useMemo(
    () => libraryMedia.find((item) => item.id === focusedMediaId) ?? null,
    [focusedMediaId, libraryMedia],
  )

  const filteredMedia = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return libraryMedia
    return libraryMedia.filter((item) => item.originalFilename.toLowerCase().includes(needle))
  }, [libraryMedia, query])

  useEffect(() => {
    if (!focusedMediaId) {
      setBinScenes([])
      setScenesLoading(false)
      return
    }
    let cancelled = false
    setScenesLoading(true)
    void (async () => {
      try {
        const response = await fetch(paths.routes.apiMediaDetail(focusedMediaId, platformProjectId), {
          cache: 'no-store',
        })
        const body = (await response.json()) as {
          scenes?: Array<{ sceneKey?: string; startMs?: number; endMs?: number }>
        }
        if (cancelled) return
        const next = (body.scenes ?? [])
          .filter(
            (scene): scene is { sceneKey: string; startMs: number; endMs: number } =>
              typeof scene.sceneKey === 'string' &&
              typeof scene.startMs === 'number' &&
              typeof scene.endMs === 'number',
          )
          .map((scene) => ({
            sceneKey: scene.sceneKey,
            startMs: scene.startMs,
            endMs: scene.endMs,
          }))
        setBinScenes(next)
      } catch {
        if (!cancelled) setBinScenes([])
      } finally {
        if (!cancelled) setScenesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [focusedMediaId, platformProjectId])

  if (focusedMedia) {
    return (
      <div className="videon-cut-bin" data-testid="cut-bin-panel" data-view="scenes">
        <div className="videon-cut-bin__chrome">
          <div className="videon-cut-bin__crumb">
            <ToolButton
              label="Zurück zur Mediathek"
              onClick={() => setFocusedMediaId(null)}
              disabled={busy}
            >
              ←
            </ToolButton>
            <Text role="label" className="videon-cut-bin__crumb-title" title={focusedMedia.originalFilename}>
              {focusedMedia.originalFilename}
            </Text>
          </div>
          <div className="videon-cut-bin__actions">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onAddWholeVideo(focusedMedia.id)}
            >
              Ganzes Video
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onAddVoiceOver(focusedMedia.id)}
            >
              Voice-Over
            </Button>
          </div>
        </div>

        {scenesLoading ? (
          <Text role="meta">Szenen laden …</Text>
        ) : binScenes.length === 0 ? (
          <EmptyState>
            Keine Analyse-Szenen — Ganzes Video einfügen oder Analyse starten.
          </EmptyState>
        ) : (
          <ul className="videon-cut-bin__grid" aria-label="Analyse-Szenen">
            {binScenes.map((scene) => (
              <li key={scene.sceneKey}>
                <button
                  type="button"
                  className="videon-cut-bin__card"
                  disabled={busy}
                  draggable={!busy}
                  title={`${scene.sceneKey} · ${formatClock(scene.startMs)} – ${formatClock(scene.endMs)}`}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      MEDIA_DRAG_TYPE,
                      JSON.stringify({
                        mediaAssetId: focusedMedia.id,
                        startMs: scene.startMs,
                        endMs: scene.endMs,
                        sceneKey: scene.sceneKey,
                      }),
                    )
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => onAddScenes(focusedMedia.id, [scene])}
                >
                  <span className="videon-cut-bin__thumb-wrap">
                    <MediaCardThumb
                      mediaAssetId={focusedMedia.id}
                      platformProjectId={platformProjectId}
                      atMs={scene.startMs}
                      ready
                      className="videon-cut-bin__thumb"
                    />
                  </span>
                  <span className="videon-cut-bin__card-title">{scene.sceneKey}</span>
                  <span className="videon-cut-bin__card-meta">
                    {formatClock(scene.startMs)} – {formatClock(scene.endMs)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="videon-cut-bin" data-testid="cut-bin-panel" data-view="library">
      <form
        className="videon-cut-bin__search"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Mediathek durchsuchen …"
          aria-label="Mediathek durchsuchen"
          size="sm"
        />
      </form>

      {filteredMedia.length === 0 ? (
        <EmptyState>
          {libraryMedia.length === 0
            ? 'Keine Videos in der Collection-Mediathek.'
            : 'Keine Treffer — Suchbegriff anpassen.'}
        </EmptyState>
      ) : (
        <ul className="videon-cut-bin__grid" aria-label="Mediathek">
          {filteredMedia.map((media) => {
            const count = media.sceneCount ?? 0
            const duration =
              media.durationMs != null && media.durationMs > 0 ? formatClock(media.durationMs) : null
            return (
              <li key={media.id}>
                <button
                  type="button"
                  className="videon-cut-bin__card"
                  disabled={busy}
                  draggable={!busy}
                  title={media.originalFilename}
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
                  onClick={() => setFocusedMediaId(media.id)}
                >
                  <span className="videon-cut-bin__thumb-wrap">
                    <MediaCardThumb
                      mediaAssetId={media.id}
                      platformProjectId={platformProjectId}
                      durationMs={media.durationMs}
                      ready={media.lifecycleState === 'ready'}
                      className="videon-cut-bin__thumb"
                    />
                  </span>
                  <span className="videon-cut-bin__card-title">{media.originalFilename}</span>
                  <span className="videon-cut-bin__card-meta">
                    {[duration, sceneLabel(count)].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
