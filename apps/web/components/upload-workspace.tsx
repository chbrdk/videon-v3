'use client'

import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { HubPageHeader } from '@/components/hub-page-header'
import { MediaUploadForm } from '@/components/media-upload-form'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'

export function UploadWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.uploadFor}>
      {(collectionId) => (
        <article className="videon-hub">
          <HubPageHeader
            eyebrow="Upload"
            title="Video hochladen"
            actions={
              <Link href={paths.routes.libraryFor(collectionId)}>
                <Button variant="ghost">Zur Mediathek</Button>
              </Link>
            }
          />
          <MediaUploadForm platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
