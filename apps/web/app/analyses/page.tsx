import Link from 'next/link'
import { Button, Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'
import { AnalysesList } from '@/components/analyses-list'
import { paths } from '@/lib/paths'

type AnalysesPageProps = {
  searchParams: Promise<{ platformProjectId?: string }>
}

export const dynamic = 'force-dynamic'

export default async function AnalysesPage({ searchParams }: AnalysesPageProps) {
  const params = await searchParams
  const platformProjectId = params.platformProjectId?.trim()

  if (!platformProjectId) {
    return (
      <AppShell description="Analysen sind Collection-gebunden.">
        <article className="videon-hub">
          <header>
            <p className="videon-spread__eyebrow">Vision</p>
            <h1 className="videon-spread__headline">Analysen</h1>
          </header>
          <Text role="body" as="p">
            Wähle zuerst eine Collection.
          </Text>
          <Link href={paths.routes.collections}>
            <Button variant="primary">Collection wählen</Button>
          </Link>
        </article>
      </AppShell>
    )
  }

  return (
    <AppShell description={`Vision-Runs für Collection ${platformProjectId}`}>
      <article className="videon-hub videon-hub--wide">
        <header className="videon-hub__header-row">
          <div>
            <p className="videon-spread__eyebrow">Vision</p>
            <h1 className="videon-spread__headline">Analysen</h1>
          </div>
          <Link href={paths.routes.uploadFor(platformProjectId)}>
            <Button variant="ghost">Video hochladen</Button>
          </Link>
        </header>
        <AnalysesList platformProjectId={platformProjectId} />
      </article>
    </AppShell>
  )
}
