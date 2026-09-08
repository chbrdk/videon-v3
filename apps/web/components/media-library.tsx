'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Badge,
  Button,
  Card,
  CardActions,
  Chip,
  EmptyState,
  FilterRow,
  LoadingText,
  RankedList,
  RankedRow,
  Text,
} from '@msqdx/ui'
import { HubIndexLayoutSwitch, useHubIndexLayout } from '@/components/hub-index-layout'
import { MediaSearch } from '@/components/media-search'
import { formatClock } from '@/lib/editor-time'
import { mediaStreamPlaybackUrl } from '@/lib/media-playback-url'
import {
  analysisStatusLabel,
  analysisStatusTone,
  mediaLifecycleLabel,
  mediaLifecycleTone,
} from '@/lib/pipeline/pipeline-status'
import { paths } from '@/lib/paths'
import { useClipThumbnail } from '@/lib/use-clip-thumbnail'

type MediaItem = {
  id: string
  originalFilename: string
  mimeType: string
  bytes: number
  lifecycleState: string
  createdAt: string
  durationMs?: number | null
  latestAnalysisStatus?: string | null
}

type LifecycleFilter = 'all' | 'ready' | 'processing' | 'uploading' | 'failed'
type AnalysisFilter = 'all' | 'none' | 'running' | 'succeeded' | 'failed'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function matchesLifecycle(item: MediaItem, filter: LifecycleFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'processing') return item.lifecycleState === 'processing' || item.lifecycleState === 'uploaded'
  return item.lifecycleState === filter
}

function matchesAnalysis(item: MediaItem, filter: AnalysisFilter): boolean {
  const status = item.latestAnalysisStatus ?? null
  if (filter === 'all') return true
  if (filter === 'none') return !status
  if (filter === 'running') return status === 'running' || status === 'queued' || status === 'processing'
  if (filter === 'succeeded') return status === 'succeeded' || status === 'completed'
  if (filter === 'failed') return status === 'failed'
  return true
}

function MediaCardThumb({
  mediaAssetId,
  platformProjectId,
  durationMs,
  ready,
}: {
  mediaAssetId: string
  platformProjectId: string
  durationMs: number | null | undefined
  ready: boolean
}) {
  const playbackUrl = ready ? mediaStreamPlaybackUrl(mediaAssetId, platformProjectId) : null
  const atMs = Math.max(0, Math.floor((durationMs ?? 2000) / 2))
  const thumbnail = useClipThumbnail(playbackUrl, atMs)
  if (!thumbnail) {
    return <div className="videon-media-card__thumb videon-media-card__thumb--empty" aria-hidden />
  }
  return (
    <div
      className="videon-media-card__thumb"
      style={{ backgroundImage: `url(${thumbnail})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      aria-hidden
    />
  )
}

export function MediaLibrary({ platformProjectId }: { platformProjectId: string }) {
  const { layout, setLayout } = useHubIndexLayout()
  const [items, setItems] = useState<MediaItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>('all')
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilter>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `${paths.routes.apiMedia}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
        { cache: 'no-store' },
      )
      const body = (await response.json()) as {
        items?: MediaItem[]
        error?: { message?: string }
      }
      if (!response.ok) throw new Error(body.error?.message || 'Mediathek konnte nicht geladen werden')
      setItems(body.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [platformProjectId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!items) return []
    return items.filter(
      (item) => matchesLifecycle(item, lifecycleFilter) && matchesAnalysis(item, analysisFilter),
    )
  }, [analysisFilter, items, lifecycleFilter])

  const filtersActive = lifecycleFilter !== 'all' || analysisFilter !== 'all'

  if (loading) {
    return (
      <EmptyState>
        <LoadingText>Medien werden geladen …</LoadingText>
      </EmptyState>
    )
  }

  if (error) {
    return (
      <EmptyState>
        <Text role="title">Mediathek nicht verfügbar</Text>
        <Text role="body">{error}</Text>
        <Button type="button" variant="ghost" onClick={() => void load()}>
          Erneut versuchen
        </Button>
      </EmptyState>
    )
  }

  if (!items?.length) {
    return (
      <EmptyState className="videon-home-empty">
        <Text role="title">Noch keine Medien</Text>
        <Text role="body">Lade das erste Video in diese Collection hoch.</Text>
        <Link href={paths.routes.uploadFor(platformProjectId)}>
          <Button variant="primary">Upload starten</Button>
        </Link>
      </EmptyState>
    )
  }

  return (
    <div className="videon-hub-index videon-media-browse">
      <div className="videon-hub-index__toolbar">
        <div className="videon-hub__actions">
          <Link href={paths.routes.uploadFor(platformProjectId)}>
            <Button variant="primary">Video hochladen</Button>
          </Link>
          <Button type="button" variant="ghost" onClick={() => void load()}>
            Aktualisieren
          </Button>
          <Link href={paths.routes.collections}>
            <Button variant="ghost">Andere Collection</Button>
          </Link>
        </div>
      </div>

      <div className="videon-media-browse__band">
        <MediaSearch platformProjectId={platformProjectId} compact />
        <FilterRow role="group" aria-label="Medienstatus" variant="toolbar">
          {(
            [
              ['all', 'Alle'],
              ['ready', 'Ready'],
              ['processing', 'In Arbeit'],
              ['uploading', 'Upload'],
              ['failed', 'Fehler'],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} size="sm" selected={lifecycleFilter === id} onClick={() => setLifecycleFilter(id)}>
              {label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow role="group" aria-label="Analysestatus" variant="toolbar">
          {(
            [
              ['all', 'Analyse'],
              ['none', 'Ohne'],
              ['running', 'Läuft'],
              ['succeeded', 'Fertig'],
              ['failed', 'Fehler'],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} size="sm" selected={analysisFilter === id} onClick={() => setAnalysisFilter(id)}>
              {label}
            </Chip>
          ))}
        </FilterRow>
        <div className="videon-media-browse__band-end">
          {filtersActive ? (
            <button
              type="button"
              className="videon-media-browse__reset"
              onClick={() => {
                setLifecycleFilter('all')
                setAnalysisFilter('all')
              }}
            >
              Filter zurücksetzen
            </button>
          ) : null}
          <HubIndexLayoutSwitch layout={layout} onChange={setLayout} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>
          <Text role="title">Keine Treffer</Text>
          <Text role="body">Filter zurücksetzen oder anderes Medium hochladen.</Text>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setLifecycleFilter('all')
              setAnalysisFilter('all')
            }}
          >
            Filter zurücksetzen
          </Button>
        </EmptyState>
      ) : layout === 'cards' ? (
        <ul className="videon-media-browse__grid" aria-label="Medien dieser Collection">
          {filtered.map((item) => {
            const ready = item.lifecycleState === 'ready' || item.lifecycleState === 'processing'
            const duration =
              item.durationMs != null && item.durationMs > 0 ? formatClock(item.durationMs) : null
            const mediaHref = paths.routes.mediaFor(item.id, platformProjectId)
            return (
              <li key={item.id}>
                <Card
                  className="videon-media-card"
                  href={mediaHref}
                  media={
                    <MediaCardThumb
                      mediaAssetId={item.id}
                      platformProjectId={platformProjectId}
                      durationMs={item.durationMs}
                      ready={ready}
                    />
                  }
                  title={item.originalFilename}
                  meta={
                    <>
                      <Badge tone={mediaLifecycleTone(item.lifecycleState)}>
                        {mediaLifecycleLabel(item.lifecycleState)}
                      </Badge>
                      <Badge tone={analysisStatusTone(item.latestAnalysisStatus)}>
                        {analysisStatusLabel(item.latestAnalysisStatus)}
                      </Badge>
                      {duration ? (
                        <Text role="meta" as="span">
                          {duration}
                        </Text>
                      ) : null}
                    </>
                  }
                  actions={
                    <CardActions>
                      <Link href={mediaHref}>
                        <Button variant="ghost" size="sm">
                          Öffnen
                        </Button>
                      </Link>
                      <Link href={paths.routes.analysesFor(platformProjectId)}>
                        <Button variant="ghost" size="sm">
                          Analysen
                        </Button>
                      </Link>
                      <Link href={paths.routes.cutsFor(platformProjectId)}>
                        <Button variant="ghost" size="sm">
                          Cuts
                        </Button>
                      </Link>
                    </CardActions>
                  }
                />
              </li>
            )
          })}
        </ul>
      ) : (
        <RankedList>
          {filtered.map((item, index) => {
            const duration =
              item.durationMs != null && item.durationMs > 0 ? formatClock(item.durationMs) : '—'
            return (
              <RankedRow
                key={item.id}
                index={index + 1}
                label={item.originalFilename}
                value={
                  <span className="ds-chip-row" style={{ gap: '0.35rem' }}>
                    <Badge tone={mediaLifecycleTone(item.lifecycleState)}>
                      {mediaLifecycleLabel(item.lifecycleState)}
                    </Badge>
                    <Badge tone={analysisStatusTone(item.latestAnalysisStatus)}>
                      {analysisStatusLabel(item.latestAnalysisStatus)}
                    </Badge>
                  </span>
                }
                secondary={`${duration} · ${formatBytes(item.bytes)}`}
                href={paths.routes.mediaFor(item.id, platformProjectId)}
                linkComponent={Link}
              />
            )
          })}
        </RankedList>
      )}
    </div>
  )
}
