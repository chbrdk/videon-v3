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
import { MediaCardThumb } from '@/components/media-card-thumb'
import { HubIndexLayoutSwitch, useHubIndexLayout } from '@/components/hub-index-layout'
import { MediaSearch } from '@/components/media-search'
import { formatClock } from '@/lib/editor-time'
import {
  analysisStatusLabel,
  analysisStatusTone,
  mediaLifecycleLabel,
  mediaLifecycleTone,
} from '@/lib/pipeline/pipeline-status'
import { paths } from '@/lib/paths'
import { useT } from '@/lib/user-prefs'

type MediaItem = {
  id: string
  originalFilename: string
  mimeType: string
  bytes: number
  lifecycleState: string
  createdAt: string
  durationMs?: number | null
  latestAnalysisStatus?: string | null
  sceneCount?: number
  platformProjectId?: string
  projectName?: string | null
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

export function MediaLibrary({ platformProjectId }: { platformProjectId?: string }) {
  const t = useT()
  const scopedId = platformProjectId?.trim() || ''
  const global = !scopedId
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
      const url = scopedId
        ? paths.routes.apiMediaList(scopedId)
        : paths.routes.apiMediaListAccessible
      const response = await fetch(url, { cache: 'no-store' })
      const body = (await response.json()) as {
        items?: MediaItem[]
        error?: { message?: string }
      }
      if (!response.ok) throw new Error(body.error?.message || t('library.loadError'))
      setItems(body.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [scopedId, t])

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
  const uploadHref = scopedId ? paths.routes.uploadFor(scopedId) : paths.routes.projects

  if (loading) {
    return (
      <EmptyState>
        <LoadingText>{t('library.loading')}</LoadingText>
      </EmptyState>
    )
  }

  if (error) {
    return (
      <EmptyState>
        <Text role="title">{t('library.unavailable')}</Text>
        <Text role="body">{error}</Text>
        <Button type="button" variant="ghost" onClick={() => void load()}>
          {t('library.retry')}
        </Button>
      </EmptyState>
    )
  }

  if (!items?.length) {
    return (
      <EmptyState className="videon-home-empty">
        <Text role="title">{t('library.emptyTitle')}</Text>
        <Text role="body">{global ? t('library.emptyBodyGlobal') : t('library.emptyBody')}</Text>
        <Link href={uploadHref}>
          <Button variant="primary">
            {global ? t('nav.chooseCollection') : t('home.startUpload')}
          </Button>
        </Link>
      </EmptyState>
    )
  }

  return (
    <div className="videon-hub-index videon-media-browse">
      <div className="videon-hub-index__toolbar">
        <div className="videon-hub__actions">
          <Link href={uploadHref}>
            <Button variant="primary">
              {global ? t('library.uploadViaProject') : t('library.upload')}
            </Button>
          </Link>
          <Button type="button" variant="ghost" onClick={() => void load()}>
            {t('library.refresh')}
          </Button>
          <Link href={paths.routes.projects}>
            <Button variant="ghost">{t('nav.projects')}</Button>
          </Link>
        </div>
      </div>

      <div className="videon-media-browse__band">
        {scopedId ? <MediaSearch platformProjectId={scopedId} compact /> : null}
        <FilterRow role="group" aria-label={t('library.lifecycleAria')} variant="toolbar">
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
        <FilterRow role="group" aria-label={t('library.analysisAria')} variant="toolbar">
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
              {t('library.resetFilters')}
            </button>
          ) : null}
          <HubIndexLayoutSwitch layout={layout} onChange={setLayout} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>
          <Text role="title">{t('library.noHits')}</Text>
          <Text role="body">{t('library.noHitsBody')}</Text>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setLifecycleFilter('all')
              setAnalysisFilter('all')
            }}
          >
            {t('library.resetFilters')}
          </Button>
        </EmptyState>
      ) : layout === 'cards' ? (
        <ul className="videon-media-browse__grid" aria-label={t('library.gridAria')}>
          {filtered.map((item) => {
            const projectId = item.platformProjectId || scopedId
            if (!projectId) return null
            const ready = item.lifecycleState === 'ready' || item.lifecycleState === 'processing'
            const duration =
              item.durationMs != null && item.durationMs > 0 ? formatClock(item.durationMs) : null
            const mediaHref = paths.routes.mediaFor(item.id, projectId)
            const projectLabel = item.projectName || projectId
            return (
              <li key={`${projectId}:${item.id}`}>
                <Card
                  className="videon-media-card"
                  href={mediaHref}
                  media={
                    <MediaCardThumb
                      mediaAssetId={item.id}
                      platformProjectId={projectId}
                      durationMs={item.durationMs}
                      ready={ready}
                    />
                  }
                  title={item.originalFilename}
                  meta={
                    <>
                      {global ? (
                        <Badge tone="neutral">{projectLabel}</Badge>
                      ) : null}
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
                          {t('library.open')}
                        </Button>
                      </Link>
                      <Link href={paths.routes.analysesFor(projectId)}>
                        <Button variant="ghost" size="sm">
                          {t('nav.analyses')}
                        </Button>
                      </Link>
                      <Link href={paths.routes.cutsFor(projectId)}>
                        <Button variant="ghost" size="sm">
                          {t('nav.cuts')}
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
            const projectId = item.platformProjectId || scopedId
            if (!projectId) return null
            const duration =
              item.durationMs != null && item.durationMs > 0 ? formatClock(item.durationMs) : '—'
            const projectLabel = item.projectName || projectId
            return (
              <RankedRow
                key={`${projectId}:${item.id}`}
                index={index + 1}
                label={item.originalFilename}
                value={
                  <span className="ds-chip-row" style={{ gap: '0.35rem' }}>
                    {global ? <Badge tone="neutral">{projectLabel}</Badge> : null}
                    <Badge tone={mediaLifecycleTone(item.lifecycleState)}>
                      {mediaLifecycleLabel(item.lifecycleState)}
                    </Badge>
                    <Badge tone={analysisStatusTone(item.latestAnalysisStatus)}>
                      {analysisStatusLabel(item.latestAnalysisStatus)}
                    </Badge>
                  </span>
                }
                secondary={`${duration} · ${formatBytes(item.bytes)}`}
                href={paths.routes.mediaFor(item.id, projectId)}
                linkComponent={Link}
              />
            )
          })}
        </RankedList>
      )}
    </div>
  )
}
