'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Alert, Button, IconResearch, Input, Text, ToolButton } from '@msqdx/ui'
import { paths } from '@/lib/paths'

type SearchHit = {
  mediaAssetId: string
  sceneKey: string | null
  searchText: string
  mediaFilename: string
  startMs: number | null
  endMs: number | null
}

export function MediaSearch({
  platformProjectId,
  onAddToCut,
  activeCutName,
  compact = false,
}: {
  platformProjectId: string
  onAddToCut?: (hit: SearchHit) => void | Promise<void>
  activeCutName?: string | null
  /** Inline in the Mediathek browse band (no outer margin). */
  compact?: boolean
}) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SearchHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)

  async function onSearch(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(paths.routes.apiMediaSearch(platformProjectId, trimmed), {
        cache: 'no-store',
      })
      const body = (await response.json()) as { items?: SearchHit[]; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Suche fehlgeschlagen')
      setItems(body.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suche fehlgeschlagen')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={compact ? 'videon-search videon-search--compact' : 'videon-search'}>
      <form className="videon-search__form" onSubmit={onSearch} role="search">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Szene, Stimmung, Dateiname …"
          aria-label="Medien durchsuchen"
        />
        <ToolButton type="submit" label={loading ? 'Sucht …' : 'Suchen'} size="md" disabled={loading || !query.trim()}>
          <IconResearch aria-hidden />
        </ToolButton>
      </form>
      {activeCutName ? (
        <Text role="meta">Aktiver Cut: {activeCutName}</Text>
      ) : onAddToCut ? (
        <Text role="meta">Öffne einen Cut-Editor, um Treffer direkt einzufügen.</Text>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {items.length > 0 ? (
        <ul className="videon-search-results" aria-label="Suchtreffer">
          {items.map((item) => {
            const hitKey = `${item.mediaAssetId}-${item.sceneKey ?? 'asset'}`
            return (
              <li key={hitKey} className="videon-search-hit">
                <Link href={paths.routes.mediaFor(item.mediaAssetId, platformProjectId)}>
                  <Text role="headline" as="span">
                    {item.mediaFilename}
                    {item.sceneKey ? ` · ${item.sceneKey}` : ''}
                  </Text>
                  <Text role="meta" as="span">
                    {item.searchText}
                  </Text>
                </Link>
                {onAddToCut && activeCutName ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={addingId === hitKey}
                    onClick={() => {
                      setAddingId(hitKey)
                      void Promise.resolve(onAddToCut(item)).finally(() => setAddingId(null))
                    }}
                  >
                    Zum Cut
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
