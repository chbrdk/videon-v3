'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, EmptyState, LoadingText, Text } from '@msqdx/ui'
import { useActiveCollection } from '@/components/collection-context'
import { HubPageHeader } from '@/components/hub-page-header'
import { paths } from '@/lib/paths'
import { useT } from '@/lib/user-prefs'

export function WorkspaceRouteGate({
  platformProjectId,
  buildHref,
  children,
}: {
  platformProjectId?: string
  buildHref: (id: string) => string
  children: (id: string) => ReactNode
}) {
  const t = useT()
  const router = useRouter()
  const { platformProjectId: storedId } = useActiveCollection()
  const resolvedId = platformProjectId || storedId || null

  useEffect(() => {
    if (platformProjectId || !storedId) return
    router.replace(buildHref(storedId))
  }, [platformProjectId, storedId, buildHref, router])

  if (!resolvedId) {
    return (
      <article className="videon-hub">
        <HubPageHeader eyebrow={t('nav.collection')} title={t('gate.title')} />
        <EmptyState>
          <Text role="body" as="p">
            {t('gate.body')}
          </Text>
          <Link href={paths.routes.projects}>
            <Button variant="primary">{t('gate.choose')}</Button>
          </Link>
        </EmptyState>
      </article>
    )
  }

  if (!platformProjectId && storedId) {
    return <LoadingText>{t('gate.loading')}</LoadingText>
  }

  return <>{children(resolvedId)}</>
}
