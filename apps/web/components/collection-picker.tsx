'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, EmptyState, Text } from '@msqdx/ui'
import { paths } from '@/lib/paths'

type CollectionItem = {
  id: string
  name: string
  status: string
  companyId: string
  domain: string | null
}

export function CollectionPicker() {
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
        <Text role="body">Collections werden geladen …</Text>
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
    <ul className="videon-collection-list" aria-label="Zugängliche Collections">
      {items.map((item) => (
        <li key={item.id} className="videon-collection-card">
          <div>
            <Text role="meta" as="p">
              {item.domain || item.companyId}
            </Text>
            <Text role="headline" as="h3">
              {item.name}
            </Text>
            <Text role="meta" as="p">
              {item.status}
            </Text>
          </div>
          <div className="videon-collection-card__actions">
            <Link href={paths.routes.libraryFor(item.id)}>
              <Button variant="primary">Mediathek öffnen</Button>
            </Link>
            <Link href={paths.routes.uploadFor(item.id)}>
              <Button variant="ghost">Upload</Button>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}
