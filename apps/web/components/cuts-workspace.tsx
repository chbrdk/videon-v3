'use client'

import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { CutsList } from '@/components/cuts-list'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'

export function CutsWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.cutsFor}>
      {(collectionId) => (
        <article className="videon-hub videon-hub--wide">
          <header className="videon-hub__header-row">
            <div>
              <p className="videon-spread__eyebrow">Editor</p>
              <h1 className="videon-spread__headline">Cuts</h1>
            </div>
            <Link href={paths.routes.libraryFor(collectionId)}>
              <Button variant="ghost">Zur Mediathek</Button>
            </Link>
          </header>
          <CutsList platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
