'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Button,
  CardActions,
  CollectionHubCard,
  EmptyState,
  LoadingText,
  Text,
} from '@msqdx/ui'
import { useActiveCollection } from '@/components/collection-context'
import { HubIndexLayoutSwitch, useHubIndexLayout } from '@/components/hub-index-layout'
import { paths } from '@/lib/paths'
import { useT } from '@/lib/user-prefs'

type CollectionItem = {
  id: string
  name: string
  status: string
  companyId: string
  domain: string | null
}

export function CollectionPicker() {
  const t = useT()
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
          throw new Error(body.error?.message || t('collections.loadError'))
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
  }, [t])

  if (loading) {
    return (
      <EmptyState>
        <LoadingText>{t('collections.loading')}</LoadingText>
      </EmptyState>
    )
  }

  if (error) {
    return (
      <EmptyState>
        <Text role="title">{t('collections.directoryError')}</Text>
        <Text role="body">{error}</Text>
      </EmptyState>
    )
  }

  if (!items?.length) {
    return (
      <EmptyState>
        <Text role="title">{t('collections.emptyTitle')}</Text>
        <Text role="body">{t('collections.emptyBody')}</Text>
      </EmptyState>
    )
  }

  return (
    <div className="videon-hub-index">
      <div className="videon-hub-index__toolbar">
        <HubIndexLayoutSwitch layout={layout} onChange={setLayout} />
      </div>
      {layout === 'cards' ? (
        <div className="ds-collection-hub-grid" aria-label={t('collections.listAria')}>
          {items.map((item) => (
            <CollectionHubCard
              key={item.id}
              kicker={item.domain || item.companyId}
              badge={item.status}
              title={item.name}
              actions={
                <CardActions>
                  <Link
                    href={paths.routes.libraryFor(item.id)}
                    onClick={() => setPlatformProjectId(item.id)}
                  >
                    <Button variant="ghost">{t('library.open')}</Button>
                  </Link>
                  <Link
                    href={paths.routes.uploadFor(item.id)}
                    onClick={() => setPlatformProjectId(item.id)}
                  >
                    <Button variant="ghost">{t('nav.upload')}</Button>
                  </Link>
                </CardActions>
              }
            />
          ))}
        </div>
      ) : (
        <ol className="ds-collection-hub-list" aria-label={t('collections.listAria')}>
          {items.map((item, index) => (
            <li key={item.id} className="ds-collection-hub-list-row">
              <span className="ds-collection-hub-list-num" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="ds-collection-hub-list-row__main">
                <Link
                  href={paths.routes.libraryFor(item.id)}
                  className="ds-collection-hub-list-row__title"
                  onClick={() => setPlatformProjectId(item.id)}
                >
                  {item.name}
                </Link>
                <Text role="meta" as="p">
                  {item.domain || item.companyId} · {item.status}
                </Text>
              </div>
              <div className="ds-collection-hub-list-row__trail">
                <Link
                  href={paths.routes.libraryFor(item.id)}
                  onClick={() => setPlatformProjectId(item.id)}
                >
                  <Button variant="ghost" size="sm">
                    {t('library.open')}
                  </Button>
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="videon-hub__actions videon-hub__actions--spaced">
        {items.slice(0, 1).map((item) => (
          <Link
            key={`upload-${item.id}`}
            href={paths.routes.uploadFor(item.id)}
            onClick={() => setPlatformProjectId(item.id)}
          >
            <Button variant="ghost">{t('collections.startUpload')}</Button>
          </Link>
        ))}
      </div>
    </div>
  )
}
