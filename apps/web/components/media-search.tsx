'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, Field, Text } from '@msqdx/ui'
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
}: {
  platformProjectId: string
  onAddToCut?: (hit: SearchHit) => void | Promise<void>
  activeCutName?: string | null
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
    <div className="videon-search">
      <form className="videon-search__form" onSubmit={onSearch}>
        <Field label="Medien durchsuchen" size="md">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szene, Stimmung, Dateiname …"
          />
        </Field>
        <Button type="submit" variant="ghost" disabled={loading || !query.trim()}>
          {loading ? 'Sucht …' : 'Suchen'}
        </Button>
      </form>
      {activeCutName ? (
        <Text role="meta">Aktiver Cut: {activeCutName}</Text>
      ) : onAddToCut ? (
        <Text role="meta">Öffne einen Cut-Editor, um Treffer direkt einzufügen.</Text>
      ) : null}
      {error ? <Text role="body">{error}</Text> : null}
      {items.length > 0 ? (
        <ul className="videon-home-activity-list">
          {items.map((item) => (
            <li key={`${item.mediaAssetId}-${item.sceneKey ?? 'asset'}`}>
              <div className="videon-search-hit">
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
                    disabled={addingId === `${item.mediaAssetId}-${item.sceneKey ?? 'asset'}`}
                    onClick={() => {
                      setAddingId(`${item.mediaAssetId}-${item.sceneKey ?? 'asset'}`)
                      void Promise.resolve(onAddToCut(item)).finally(() => setAddingId(null))
                    }}
                  >
                    Zum Cut
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
