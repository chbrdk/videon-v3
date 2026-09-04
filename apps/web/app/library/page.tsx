import { EmptyState, Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'

type LibraryPageProps = {
  searchParams: Promise<{ platformProjectId?: string }>
}

export const dynamic = 'force-dynamic'

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const params = await searchParams
  const platformProjectId = params.platformProjectId?.trim()

  return (
    <AppShell
      description={
        platformProjectId
          ? `Collection-Kontext aktiv: ${platformProjectId}`
          : 'Öffne VIDEON aus einer PLEXON Collection, um eine Mediathek zu wählen.'
      }
    >
      <article className="videon-hub">
        <header>
          <p className="videon-spread__eyebrow">Medien</p>
          <h1 className="videon-spread__headline">Mediathek</h1>
        </header>
        <EmptyState>
          <Text role="title">Noch keine Medien</Text>
          <Text role="body">
            Die Collection-gebundene Upload-Pipeline wird nach Storage- und Queue-Gates freigeschaltet.
          </Text>
        </EmptyState>
      </article>
    </AppShell>
  )
}
