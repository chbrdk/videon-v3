'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Alert,
  Button,
  EmptyState,
  HubIndexCard,
  LoadingText,
  RankedList,
  RankedRow,
  Text,
} from '@msqdx/ui'
import { HubIndexLayoutSwitch, useHubIndexLayout } from '@/components/hub-index-layout'
import { paths } from '@/lib/paths'

type CutItem = {
  id: string
  name: string
  status: string
  updatedAt: string
}

export function CutsList({ platformProjectId }: { platformProjectId: string }) {
  const { layout, setLayout } = useHubIndexLayout()
  const [items, setItems] = useState<CutItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(paths.routes.apiCuts(platformProjectId), { cache: 'no-store' })
      const body = (await response.json()) as { items?: CutItem[]; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Cuts konnten nicht geladen werden')
      setItems(body.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cuts konnten nicht geladen werden')
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
        <LoadingText>Cuts werden geladen …</LoadingText>
      </EmptyState>
    )
  }
  if (error) {
    return (
      <EmptyState>
        <Alert tone="error">{error}</Alert>
      </EmptyState>
    )
  }
  if (!items.length) {
    return (
      <EmptyState>
        <Text role="title">Noch keine Cuts</Text>
        <Text role="body">Erstelle einen Cut im Video-Editor über „Als Cut speichern“.</Text>
        <Link href={paths.routes.libraryFor(platformProjectId)}>
          <Button variant="ghost">Zur Mediathek</Button>
        </Link>
      </EmptyState>
    )
  }

  return (
    <div className="videon-hub-index">
      <div className="videon-hub-index__toolbar">
        <HubIndexLayoutSwitch layout={layout} onChange={setLayout} />
      </div>
      {layout === 'cards' ? (
        <ul className="ds-hub-index-grid" aria-label="Cuts">
          {items.map((item) => (
            <li key={item.id}>
              <HubIndexCard
                href={paths.routes.cutFor(item.id, platformProjectId)}
                title={item.name}
                meta={
                  <>
                    <span>{item.status}</span>
                    <span aria-hidden>·</span>
                    <span>{new Date(item.updatedAt).toLocaleString('de-DE')}</span>
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
              secondary={item.status}
              href={paths.routes.cutFor(item.id, platformProjectId)}
              linkComponent={Link}
            />
          ))}
        </RankedList>
      )}
    </div>
  )
}
