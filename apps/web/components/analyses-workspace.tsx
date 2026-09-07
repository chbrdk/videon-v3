'use client'

import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { AnalysesList } from '@/components/analyses-list'
import { HubPageHeader } from '@/components/hub-page-header'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'

export function AnalysesWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.analysesFor}>
      {(collectionId) => (
        <article className="videon-hub videon-hub--wide">
          <HubPageHeader
            eyebrow="Vision"
            title="Analysen"
            actions={
              <Link href={paths.routes.uploadFor(collectionId)}>
                <Button variant="ghost">Video hochladen</Button>
              </Link>
            }
          />
          <AnalysesList platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
