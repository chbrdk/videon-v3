'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, EmptyState, Text } from '@msqdx/ui'
import { paths } from '@/lib/paths'

type MediaItem = {
  id: string
  originalFilename: string
  mimeType: string
  bytes: number
  lifecycleState: string
  createdAt: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function MediaLibrary({ platformProjectId }: { platformProjectId: string }) {
  const [items, setItems] = useState<MediaItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  if (loading) {
    return (
      <EmptyState>
        <Text role="body">Medien werden geladen …</Text>
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
    <div className="videon-media-list-wrap">
      <div className="videon-media-list-wrap__actions">
        <Link href={paths.routes.uploadFor(platformProjectId)}>
          <Button variant="primary">Video hochladen</Button>
        </Link>
        <Button type="button" variant="ghost" onClick={() => void load()}>
          Aktualisieren
        </Button>
      </div>
      <ul className="videon-media-list" aria-label="Medien dieser Collection">
        {items.map((item) => (
          <li key={item.id} className="videon-media-row">
            <div>
              <Link href={paths.routes.mediaFor(item.id, platformProjectId)}>
                <Text role="headline" as="h3">
                  {item.originalFilename}
                </Text>
              </Link>
              <Text role="meta" as="p">
                {item.mimeType} · {formatBytes(item.bytes)} · {item.lifecycleState}
              </Text>
            </div>
            <div className="videon-media-row__aside">
              <Text role="meta" as="p">
                {new Date(item.createdAt).toLocaleString('de-DE')}
              </Text>
              <Link href={paths.routes.mediaFor(item.id, platformProjectId)}>
                <Button variant="ghost">Öffnen</Button>
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
