'use client'

import { CollectionScopedHubHeader } from '@/components/collection-scoped-hub-header'
import { MediaLibrary } from '@/components/media-library'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'
import { useT } from '@/lib/user-prefs'

export function LibraryWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  const t = useT()
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.libraryFor}>
      {(collectionId) => (
        <article className="videon-hub videon-hub--wide">
          <CollectionScopedHubHeader
            platformProjectId={collectionId}
            title={t('nav.library')}
            deck={t('library.deck')}
          />
          <MediaLibrary platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
