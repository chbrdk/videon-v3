import { AppShell } from '@/components/app-shell'
import { UploadWorkspace } from '@/components/upload-workspace'

type UploadPageProps = {
  searchParams: Promise<{ platformProjectId?: string }>
}

export const dynamic = 'force-dynamic'

export default async function UploadPage({ searchParams }: UploadPageProps) {
  const params = await searchParams
  const platformProjectId = params.platformProjectId?.trim()

  return (
    <AppShell description={platformProjectId ? `Signierter Upload in Collection ${platformProjectId}` : 'Upload'}>
      <UploadWorkspace platformProjectId={platformProjectId} />
    </AppShell>
  )
}
