'use client'

import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { AnalysesList } from '@/components/analyses-list'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'

export function AnalysesWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.analysesFor}>
      {(collectionId) => (
        <article className="videon-hub videon-hub--wide">
          <header className="videon-hub__header-row">
            <div>
              <p className="videon-spread__eyebrow">Vision</p>
              <h1 className="videon-spread__headline">Analysen</h1>
            </div>
            <Link href={paths.routes.uploadFor(collectionId)}>
              <Button variant="ghost">Video hochladen</Button>
            </Link>
          </header>
          <AnalysesList platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
