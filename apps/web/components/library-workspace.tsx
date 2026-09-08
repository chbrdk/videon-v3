'use client'

import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { HubPageHeader } from '@/components/hub-page-header'
import { MediaLibrary } from '@/components/media-library'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'

export function LibraryWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.libraryFor}>
      {(collectionId) => (
        <article className="videon-hub videon-hub--wide">
          <HubPageHeader
            eyebrow="Medien"
            title="Mediathek"
            actions={
              <>
                <Link href={paths.routes.uploadFor(collectionId)}>
                  <Button variant="primary">Video hochladen</Button>
                </Link>
                <Link href={paths.routes.collections}>
                  <Button variant="ghost">Andere Collection</Button>
                </Link>
              </>
            }
          />
          <MediaLibrary platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
