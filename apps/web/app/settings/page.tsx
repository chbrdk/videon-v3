import { SettingsBand, SettingsShell, Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'
import { paths } from '@/lib/paths'
import { federationMode } from '@/lib/runtime-config'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <AppShell description="Runtime-Konfiguration und Federation-Status.">
      <article className="videon-hub">
        <SettingsShell
          labels={{
            account: 'Produkt',
            profile: 'Federation',
            appearance: 'Appearance',
            language: 'Sprache',
          }}
          lede={
            <Text role="display" as="h1">
              Einstellungen
            </Text>
          }
          account={
            <Text role="body" as="p">
              {paths.brandLabel} ({paths.appName})
            </Text>
          }
          accountHelp="Produktidentität der VIDEON-Insel."
          profile={
            <Text role="body" as="p">
              Modus: {federationMode()} · Contract: {paths.federationContract}
            </Text>
          }
          profileHelp="Live federation requires PLEXON_SERVICE_SECRET and a non-dummy mode."
          extras={
            <SettingsBand title="Collection" help="VIDEON ist Collection-bound — kein zweites Projektmodell.">
              <Text role="body" as="p">
                Workspaces und Medien sind immer an `platformProjectId` gebunden (Access Model B).
              </Text>
            </SettingsBand>
          }
        />
      </article>
    </AppShell>
  )
}
