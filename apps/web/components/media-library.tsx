'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Button,
  Chip,
  EmptyState,
  EntityCard,
  FilterRow,
  LoadingText,
  RankedList,
  RankedRow,
  StatusDot,
  Text,
  type StatusLevel,
} from '@msqdx/ui'
import { HubIndexLayoutSwitch, useHubIndexLayout } from '@/components/hub-index-layout'
import { formatClock } from '@/lib/editor-time'
import { mediaStreamPlaybackUrl } from '@/lib/media-playback-url'
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

function analysisLevel(status: string | null | undefined): StatusLevel {
  if (!status) return 'ok'
  if (status === 'failed') return 'critical'
  if (status === 'running' || status === 'queued' || status === 'processing') return 'warn'
  return 'ok'
}

function analysisLabel(status: string | null | undefined): string {
  if (!status) return 'Keine Analyse'
  if (status === 'succeeded' || status === 'completed') return 'Analysiert'
  if (status === 'failed') return 'Analyse fehlgeschlagen'
  if (status === 'running' || status === 'queued' || status === 'processing') return 'Analyse läuft'
  return status
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
      style={{ backgroundImage: `url(${thumbnail})` }}
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
        </div>
        <HubIndexLayoutSwitch layout={layout} onChange={setLayout} />
      </div>

      <FilterRow label="Status" variant="toolbar">
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
      <FilterRow label="Analyse" variant="toolbar">
        {(
          [
            ['all', 'Alle'],
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
              <li key={item.id} className="videon-media-card">
                <EntityCard
                  className="videon-media-card__entity"
                  meta={
                    <span className="videon-media-card__status">
                      <StatusDot level={analysisLevel(item.latestAnalysisStatus)} />
                      <span>{item.lifecycleState}</span>
                    </span>
                  }
                  badge={
                    <Chip static size="sm">
                      {analysisLabel(item.latestAnalysisStatus)}
                    </Chip>
                  }
                  title={
                    <Link href={mediaHref} className="videon-media-card__title-link">
                      {item.originalFilename}
                    </Link>
                  }
                  toolbar={
                    <div className="videon-media-card__actions">
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
                    </div>
                  }
                  footer={
                    <>
                      {duration ? (
                        <Chip static size="sm">
                          {duration}
                        </Chip>
                      ) : null}
                      <Text role="meta" as="span">
                        {item.mimeType} · {formatBytes(item.bytes)}
                      </Text>
                    </>
                  }
                >
                  <Link href={mediaHref} className="videon-media-card__thumb-link" tabIndex={-1}>
                    <MediaCardThumb
                      mediaAssetId={item.id}
                      platformProjectId={platformProjectId}
                      durationMs={item.durationMs}
                      ready={ready}
                    />
                  </Link>
                </EntityCard>
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
                value={item.lifecycleState}
                secondary={`${duration} · ${analysisLabel(item.latestAnalysisStatus)} · ${formatBytes(item.bytes)}`}
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
