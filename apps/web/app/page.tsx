import { AppShell } from '@/components/app-shell'
import { HomeMagazine } from '@/components/home-magazine'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  return (
    <AppShell>
      <HomeMagazine />
    </AppShell>
  )
}
