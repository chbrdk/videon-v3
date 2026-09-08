'use client'

import { CollectionPicker } from '@/components/collection-picker'
import { HubPageHeader } from '@/components/hub-page-header'
import { useT } from '@/lib/user-prefs'

export function CollectionsSwitcherHub() {
  const t = useT()
  return (
    <article className="videon-hub videon-hub--wide">
      <HubPageHeader
        eyebrow="PLEXON"
        title={t('collections.title')}
        deck={t('collections.deck')}
      />
      <CollectionPicker />
    </article>
  )
}
