import { AppShell } from '@/components/app-shell'
import { CutsWorkspace } from '@/components/cuts-workspace'

type CutsPageProps = {
  searchParams: Promise<{ platformProjectId?: string }>
}

export const dynamic = 'force-dynamic'

export default async function CutsPage({ searchParams }: CutsPageProps) {
  const params = await searchParams
  const platformProjectId = params.platformProjectId?.trim()

  return (
    <AppShell description="Cuts sind bearbeitbare Schnittversionen — der Video-Editor öffnet sich pro Medium.">
      <CutsWorkspace platformProjectId={platformProjectId} />
    </AppShell>
  )
}
