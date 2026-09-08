'use client'

import { HubPageHeader } from '@/components/hub-page-header'
import { MediaLibrary } from '@/components/media-library'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'

export function LibraryWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.libraryFor}>
      {(collectionId) => (
        <article className="videon-hub videon-hub--wide">
          <HubPageHeader title="Mediathek" />
          <MediaLibrary platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
