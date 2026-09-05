'use client'

import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { MediaLibrary } from '@/components/media-library'
import { MediaSearch } from '@/components/media-search'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'

export function LibraryWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.libraryFor}>
      {(collectionId) => (
        <article className="videon-hub videon-hub--wide">
          <header className="videon-hub__header-row">
            <div>
              <p className="videon-spread__eyebrow">Medien</p>
              <h1 className="videon-spread__headline">Mediathek</h1>
            </div>
            <div className="videon-collection-card__actions">
              <Link href={paths.routes.uploadFor(collectionId)}>
                <Button variant="primary">Video hochladen</Button>
              </Link>
              <Link href={paths.routes.collections}>
                <Button variant="ghost">Andere Collection</Button>
              </Link>
            </div>
          </header>
          <MediaSearch platformProjectId={collectionId} />
          <MediaLibrary platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
