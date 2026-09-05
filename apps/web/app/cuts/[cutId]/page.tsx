import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'
import { CutEditorView } from '@/components/cut-editor-view'
import { paths } from '@/lib/paths'

type CutPageProps = {
  params: Promise<{ cutId: string }>
  searchParams: Promise<{ platformProjectId?: string }>
}

export const dynamic = 'force-dynamic'

export default async function CutDetailPage({ params, searchParams }: CutPageProps) {
  const { cutId } = await params
  const query = await searchParams
  const platformProjectId = query.platformProjectId?.trim()

  if (!platformProjectId) {
    return (
      <AppShell description="Cut-Editor benötigt einen Collection-Kontext.">
        <article className="videon-hub">
          <Link href={paths.routes.collections}>
            <Button variant="primary">Collection wählen</Button>
          </Link>
        </article>
      </AppShell>
    )
  }

  return (
    <AppShell description={`Cut ${cutId}`}>
      <article className="videon-hub videon-hub--wide">
        <header className="videon-hub__header-row">
          <div>
            <p className="videon-spread__eyebrow">Editor</p>
            <h1 className="videon-spread__headline">Cut</h1>
          </div>
          <Link href={paths.routes.cutsFor(platformProjectId)}>
            <Button variant="ghost">Alle Cuts</Button>
          </Link>
        </header>
        <CutEditorView platformProjectId={platformProjectId} cutId={cutId} />
      </article>
    </AppShell>
  )
}
