'use client'

import Link from 'next/link'
import { Button, EmptyState, Text } from '@msqdx/ui'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'

export function CutsWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.cutsFor}>
      {(collectionId) => (
        <article className="videon-hub">
          <header className="videon-hub__header-row">
            <div>
              <p className="videon-spread__eyebrow">Editor</p>
              <h1 className="videon-spread__headline">Cuts</h1>
            </div>
            <Link href={paths.routes.libraryFor(collectionId)}>
              <Button variant="ghost">Zur Mediathek</Button>
            </Link>
          </header>
          <EmptyState>
            <Text role="title">Video-Editor in der Mediathek</Text>
            <Text role="body">
              Öffne ein hochgeladenes Video im Editor: Wiedergabe, Szenen-Timeline, Analyse erneut starten und löschen.
              Dedizierte Cuts (Schnittprojekte) folgen in einer späteren Welle.
            </Text>
            <Link href={paths.routes.libraryFor(collectionId)}>
              <Button variant="primary">Zur Mediathek</Button>
            </Link>
          </EmptyState>
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
