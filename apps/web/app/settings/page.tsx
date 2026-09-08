import { AppShell } from '@/components/app-shell'
import { SettingsPage } from '@/components/settings-page'
import { federationMode } from '@/lib/runtime-config'

export const dynamic = 'force-dynamic'

export default function SettingsRoutePage() {
  return (
    <AppShell>
      <article className="videon-hub">
        <SettingsPage federationModeLabel={federationMode()} />
      </article>
    </AppShell>
  )
}
