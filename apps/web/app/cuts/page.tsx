import Link from 'next/link'
import { Button, EmptyState, Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'
import { paths } from '@/lib/paths'

export const dynamic = 'force-dynamic'

type CutsPageProps = {
  searchParams: Promise<{ platformProjectId?: string }>
}

export default async function CutsPage({ searchParams }: CutsPageProps) {
  const params = await searchParams
  const platformProjectId = params.platformProjectId?.trim()

  return (
    <AppShell description="Cuts sind bearbeitbare Schnittversionen — der Video-Editor öffnet sich pro Medium.">
      <article className="videon-hub">
        <header>
          <p className="videon-spread__eyebrow">Editor</p>
          <h1 className="videon-spread__headline">Cuts</h1>
        </header>
        <EmptyState>
          <Text role="title">Video-Editor in der Mediathek</Text>
          <Text role="body">
            Öffne ein hochgeladenes Video im Editor: Wiedergabe, Szenen-Timeline, Analyse erneut starten und löschen.
            Dedizierte Cuts (Schnittprojekte) folgen in einer späteren Welle.
          </Text>
          {platformProjectId ? (
            <Link href={paths.routes.libraryFor(platformProjectId)}>
              <Button variant="primary">Zur Mediathek</Button>
            </Link>
          ) : (
            <Link href={paths.routes.collections}>
              <Button variant="primary">Collection wählen</Button>
            </Link>
          )}
        </EmptyState>
      </article>
    </AppShell>
  )
}
