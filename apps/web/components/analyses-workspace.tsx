'use client'

import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { AnalysesList } from '@/components/analyses-list'
import { CollectionScopedHubHeader } from '@/components/collection-scoped-hub-header'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'
import { useT } from '@/lib/user-prefs'

export function AnalysesWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  const t = useT()
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.analysesFor}>
      {(collectionId) => (
        <article className="videon-hub videon-hub--wide">
          <CollectionScopedHubHeader
            platformProjectId={collectionId}
            title={t('nav.analyses')}
            deck={t('analyses.deck')}
            actions={
              <Link href={paths.routes.uploadFor(collectionId)}>
                <Button variant="ghost">{t('analyses.upload')}</Button>
              </Link>
            }
          />
          <AnalysesList platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
