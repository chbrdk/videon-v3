import { AppShell } from '@/components/app-shell'
import { CollectionPicker } from '@/components/collection-picker'
import { HubPageHeader } from '@/components/hub-page-header'

export const dynamic = 'force-dynamic'

export default function CollectionsPage() {
  return (
    <AppShell description="Access Model B — nur Collections, die dir in PLEXON zugewiesen sind.">
      <article className="videon-hub videon-hub--wide">
        <HubPageHeader eyebrow="PLEXON" title="Collections" />
        <CollectionPicker />
      </article>
    </AppShell>
  )
}
