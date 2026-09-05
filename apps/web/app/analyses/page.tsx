import { AppShell } from '@/components/app-shell'
import { AnalysesWorkspace } from '@/components/analyses-workspace'

type AnalysesPageProps = {
  searchParams: Promise<{ platformProjectId?: string }>
}

export const dynamic = 'force-dynamic'

export default async function AnalysesPage({ searchParams }: AnalysesPageProps) {
  const params = await searchParams
  const platformProjectId = params.platformProjectId?.trim()

  return (
    <AppShell description={platformProjectId ? `Vision-Runs für Collection ${platformProjectId}` : 'Analysen'}>
      <AnalysesWorkspace platformProjectId={platformProjectId} />
    </AppShell>
  )
}
