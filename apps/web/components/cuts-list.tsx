'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, EmptyState, Text } from '@msqdx/ui'
import { paths } from '@/lib/paths'

type CutItem = {
  id: string
  name: string
  status: string
  updatedAt: string
}

export function CutsList({ platformProjectId }: { platformProjectId: string }) {
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

  if (loading) return <Text role="body">Cuts werden geladen …</Text>
  if (error) return <Text role="body">{error}</Text>
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
    <ul className="videon-media-list">
      {items.map((item) => (
        <li key={item.id} className="videon-media-row">
          <div>
            <Link href={paths.routes.cutFor(item.id, platformProjectId)}>
              <Text role="headline" as="h3">
                {item.name}
              </Text>
            </Link>
            <Text role="meta" as="p">
              {item.status}
            </Text>
          </div>
          <Link href={paths.routes.cutFor(item.id, platformProjectId)}>
            <Button variant="ghost">Öffnen</Button>
          </Link>
        </li>
      ))}
    </ul>
  )
}
