import { AppShell } from '@/components/app-shell'
import { CollectionsSwitcherHub } from '@/components/collections-switcher-hub'

export const dynamic = 'force-dynamic'

export default function CollectionsPage() {
  return (
    <AppShell>
      <CollectionsSwitcherHub />
    </AppShell>
  )
}
