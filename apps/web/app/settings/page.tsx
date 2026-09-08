import { AppShell } from '@/components/app-shell'
import { SettingsPage } from '@/components/settings-page'
import { listApiTokensForOwner, toApiTokenOwnerId } from '@/lib/api-tokens'
import { auth } from '@/auth'
import { federationMode } from '@/lib/runtime-config'

export const dynamic = 'force-dynamic'

export default async function SettingsRoutePage() {
  const session = await auth()
  const ownerId = toApiTokenOwnerId(session?.user)
  const { items: initialTokens } = await listApiTokensForOwner(ownerId)

  return (
    <AppShell>
      <article className="videon-hub">
        <SettingsPage federationModeLabel={federationMode()} initialTokens={initialTokens} />
      </article>
    </AppShell>
  )
}
