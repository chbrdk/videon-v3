'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Text } from '@msqdx/ui'
import { useActiveCollection } from '@/components/collection-context'
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
        <header>
          <p className="videon-spread__eyebrow">Collection</p>
          <h1 className="videon-spread__headline">Kontext fehlt</h1>
        </header>
        <Text role="body" as="p">
          Diese Fläche ist an eine PLEXON Collection gebunden. Wähle zuerst eine Collection.
        </Text>
        <Link href={paths.routes.collections}>
          <Button variant="primary">Collection wählen</Button>
        </Link>
      </article>
    )
  }

  if (!platformProjectId && storedId) {
    return <Text role="body">Collection wird geladen …</Text>
  }

  return <>{children(resolvedId)}</>
}
