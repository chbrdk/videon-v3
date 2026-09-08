'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, EmptyState, LoadingText, Text } from '@msqdx/ui'
import { useActiveCollection } from '@/components/collection-context'
import { HubPageHeader } from '@/components/hub-page-header'
import { paths } from '@/lib/paths'

export function WorkspaceRouteGate({
  platformProjectId,
  buildHref,
  children,
}: {
  platformProjectId?: string
  buildHref: (id: string) => string
  children: (id: string) => ReactNode
}) {
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
        <HubPageHeader eyebrow="Projekt" title="Collection fehlt" />
        <EmptyState>
          <Text role="body" as="p">
            Mediathek, Upload, Analysen und Cuts gehören zu einer aktiven Collection (PLEXON-Projekt).
            Wähle zuerst eine zugängliche Collection.
          </Text>
          <Link href={paths.routes.collections}>
            <Button variant="primary">Projekt wählen</Button>
          </Link>
        </EmptyState>
      </article>
    )
  }

  if (!platformProjectId && storedId) {
    return <LoadingText>Collection wird geladen …</LoadingText>
  }

  return <>{children(resolvedId)}</>
}
