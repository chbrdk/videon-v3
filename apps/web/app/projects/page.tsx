import { AppShell } from '@/components/app-shell'
import { CollectionsSwitcherHub } from '@/components/collections-switcher-hub'

export const dynamic = 'force-dynamic'

export default function ProjectsPage() {
  return (
    <AppShell>
      <CollectionsSwitcherHub />
    </AppShell>
  )
}
