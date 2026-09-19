'use client'

import { useActiveCollection } from '@/components/collection-context'
import { CollectionPicker } from '@/components/collection-picker'
import { CollectionTeamPanel } from '@/components/collection-team-panel'
import { HubPageHeader } from '@/components/hub-page-header'
import { useT } from '@/lib/user-prefs'

export function CollectionsSwitcherHub() {
  const t = useT()
  const { platformProjectId } = useActiveCollection()
  return (
    <article className="videon-hub videon-hub--wide">
      <HubPageHeader
        eyebrow="PLEXON"
        title={t('collections.title')}
        deck={t('collections.deck')}
      />
      <div className="videon-hub__with-aside">
        <div className="videon-hub__with-aside-main">
          <CollectionPicker />
        </div>
        <aside className="videon-hub__aside" aria-label={t('collections.team.title')}>
          <CollectionTeamPanel platformProjectId={platformProjectId} />
        </aside>
      </div>
    </article>
  )
}
