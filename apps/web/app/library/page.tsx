import { AppShell } from '@/components/app-shell'
import { LibraryWorkspace } from '@/components/library-workspace'

type LibraryPageProps = {
  searchParams: Promise<{ platformProjectId?: string }>
}

export const dynamic = 'force-dynamic'

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const params = await searchParams
  const platformProjectId = params.platformProjectId?.trim()

  return (
    <AppShell description={platformProjectId ? `Collection-Kontext: ${platformProjectId}` : 'Mediathek'}>
      <LibraryWorkspace platformProjectId={platformProjectId} />
    </AppShell>
  )
}
