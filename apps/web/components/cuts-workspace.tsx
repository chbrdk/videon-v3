'use client'

import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { CutsList } from '@/components/cuts-list'
import { HubPageHeader } from '@/components/hub-page-header'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'

export function CutsWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.cutsFor}>
      {(collectionId) => (
        <article className="videon-hub videon-hub--wide">
          <HubPageHeader
            eyebrow="Editor"
            title="Cuts"
            actions={
              <Link href={paths.routes.libraryFor(collectionId)}>
                <Button variant="ghost">Zur Mediathek</Button>
              </Link>
            }
          />
          <CutsList platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
