import { EmptyState, Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'

type LibraryPageProps = {
  searchParams: Promise<{ platformProjectId?: string }>
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const params = await searchParams
  const platformProjectId = params.platformProjectId?.trim()

  return (
    <AppShell
      title="Mediathek"
      description={
        platformProjectId
          ? `Collection-Kontext aktiv: ${platformProjectId}`
          : 'Öffne VIDEON aus einer PLEXON Collection, um eine Mediathek zu wählen.'
      }
    >
      <EmptyState>
        <Text role="title">Noch keine Medien</Text>
        <Text role="body">
          Die Collection-gebundene Upload-Pipeline wird nach Storage- und Queue-Integration freigeschaltet.
        </Text>
      </EmptyState>
    </AppShell>
  )
}
