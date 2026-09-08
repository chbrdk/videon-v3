'use client'

import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { CollectionScopedHubHeader } from '@/components/collection-scoped-hub-header'
import { MediaUploadForm } from '@/components/media-upload-form'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'
import { useT } from '@/lib/user-prefs'

export function UploadWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  const t = useT()
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.uploadFor}>
      {(collectionId) => (
        <article className="videon-hub">
          <CollectionScopedHubHeader
            platformProjectId={collectionId}
            title={t('upload.title')}
            deck={t('upload.deck')}
            actions={
              <Link href={paths.routes.libraryFor(collectionId)}>
                <Button variant="ghost">{t('upload.toLibrary')}</Button>
              </Link>
            }
          />
          <MediaUploadForm platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
