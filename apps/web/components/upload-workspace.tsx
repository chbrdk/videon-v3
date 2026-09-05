'use client'

import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { MediaUploadForm } from '@/components/media-upload-form'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'

export function UploadWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.uploadFor}>
      {(collectionId) => (
        <article className="videon-hub">
          <header className="videon-hub__header-row">
            <div>
              <p className="videon-spread__eyebrow">Upload</p>
              <h1 className="videon-spread__headline">Video hochladen</h1>
            </div>
            <Link href={paths.routes.libraryFor(collectionId)}>
              <Button variant="ghost">Zur Mediathek</Button>
            </Link>
          </header>
          <MediaUploadForm platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
