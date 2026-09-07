'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Button,
  EmptyState,
  HubIndexCard,
  LoadingText,
  RankedList,
  RankedRow,
  Text,
} from '@msqdx/ui'
import { useActiveCollection } from '@/components/collection-context'
import { HubIndexLayoutSwitch, useHubIndexLayout } from '@/components/hub-index-layout'
import { paths } from '@/lib/paths'

type CollectionItem = {
  id: string
  name: string
  status: string
  companyId: string
  domain: string | null
}

export function CollectionPicker() {
  const { setPlatformProjectId } = useActiveCollection()
  const { layout, setLayout } = useHubIndexLayout()
  const [items, setItems] = useState<CollectionItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(paths.routes.apiCollections, { cache: 'no-store' })
        const body = (await response.json()) as {
          items?: CollectionItem[]
          error?: { message?: string }
        }
        if (!response.ok) {
          throw new Error(body.error?.message || 'Collections konnten nicht geladen werden')
        }
        if (!cancelled) setItems(body.items ?? [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <EmptyState>
        <LoadingText>Collections werden geladen …</LoadingText>
      </EmptyState>
    )
  }

  if (error) {
    return (
      <EmptyState>
        <Text role="title">Directory nicht erreichbar</Text>
        <Text role="body">{error}</Text>
      </EmptyState>
    )
  }

  if (!items?.length) {
    return (
      <EmptyState>
        <Text role="title">Keine zugänglichen Collections</Text>
        <Text role="body">
          Access Model B: VIDEON zeigt nur Collections, die dir in PLEXON explizit zugewiesen sind.
        </Text>
      </EmptyState>
    )
  }

  return (
    <div className="videon-hub-index">
      <div className="videon-hub-index__toolbar">
        <HubIndexLayoutSwitch layout={layout} onChange={setLayout} />
      </div>
      {layout === 'cards' ? (
        <ul className="ds-hub-index-grid" aria-label="Zugängliche Collections">
          {items.map((item) => (
            <li key={item.id}>
              <HubIndexCard
                href={paths.routes.libraryFor(item.id)}
                onClick={() => setPlatformProjectId(item.id)}
                title={item.name}
                meta={
                  <>
                    <span>{item.domain || item.companyId}</span>
                    <span aria-hidden>·</span>
                    <span>{item.status}</span>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <RankedList>
          {items.map((item, index) => (
            <RankedRow
              key={item.id}
              index={index + 1}
              label={item.name}
              secondary={`${item.domain || item.companyId} · ${item.status}`}
              href={paths.routes.libraryFor(item.id)}
              linkComponent={Link}
              onActivate={() => setPlatformProjectId(item.id)}
            />
          ))}
        </RankedList>
      )}
      <div className="videon-hub__actions videon-hub__actions--spaced">
        {items.slice(0, 1).map((item) => (
          <Link
            key={`upload-${item.id}`}
            href={paths.routes.uploadFor(item.id)}
            onClick={() => setPlatformProjectId(item.id)}
          >
            <Button variant="ghost">Ersten Upload starten</Button>
          </Link>
        ))}
      </div>
    </div>
  )
}
