'use client'

import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { CollectionScopedHubHeader } from '@/components/collection-scoped-hub-header'
import { CutsList } from '@/components/cuts-list'
import { WorkspaceRouteGate } from '@/components/workspace-route-gate'
import { paths } from '@/lib/paths'
import { useT } from '@/lib/user-prefs'

export function CutsWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  const t = useT()
  return (
    <WorkspaceRouteGate platformProjectId={platformProjectId} buildHref={paths.routes.cutsFor}>
      {(collectionId) => (
        <article className="videon-hub videon-hub--wide">
          <CollectionScopedHubHeader
            platformProjectId={collectionId}
            title={t('nav.cuts')}
            deck={t('cuts.deck')}
            actions={
              <Link href={paths.routes.libraryFor(collectionId)}>
                <Button variant="ghost">{t('cuts.toLibrary')}</Button>
              </Link>
            }
          />
          <CutsList platformProjectId={collectionId} />
        </article>
      )}
    </WorkspaceRouteGate>
  )
}
