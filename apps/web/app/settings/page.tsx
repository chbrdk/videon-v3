import { Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'
import { paths } from '@/lib/paths'
import { federationMode } from '@/lib/runtime-config'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <AppShell description="Runtime-Konfiguration und Federation-Status.">
      <article className="videon-hub">
        <header>
          <p className="videon-spread__eyebrow">System</p>
          <h1 className="videon-spread__headline">Einstellungen</h1>
        </header>
        <Text role="body" as="p">
          Produkt: {paths.brandLabel} · Federation: {federationMode()} · Contract:{' '}
          {paths.federationContract}
        </Text>
      </article>
    </AppShell>
  )
}
