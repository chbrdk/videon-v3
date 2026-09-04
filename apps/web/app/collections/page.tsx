import { AppShell } from '@/components/app-shell'
import { CollectionPicker } from '@/components/collection-picker'

export const dynamic = 'force-dynamic'

export default function CollectionsPage() {
  return (
    <AppShell description="Access Model B — nur Collections, die dir in PLEXON zugewiesen sind.">
      <article className="videon-hub videon-hub--wide">
        <header>
          <p className="videon-spread__eyebrow">PLEXON</p>
          <h1 className="videon-spread__headline">Collections</h1>
        </header>
        <CollectionPicker />
      </article>
    </AppShell>
  )
}
