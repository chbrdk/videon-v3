import Link from 'next/link'
import { Button, Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'
import { MediaEditorView } from '@/components/media-editor-view'
import { paths } from '@/lib/paths'

type MediaPageProps = {
  params: Promise<{ mediaAssetId: string }>
  searchParams: Promise<{ platformProjectId?: string }>
}

export const dynamic = 'force-dynamic'

export default async function MediaDetailPage({ params, searchParams }: MediaPageProps) {
  const { mediaAssetId } = await params
  const query = await searchParams
  const platformProjectId = query.platformProjectId?.trim()

  if (!platformProjectId) {
    return (
      <AppShell description="Medien-Editor benötigt einen Collection-Kontext.">
        <article className="videon-hub">
          <header>
            <p className="videon-spread__eyebrow">Editor</p>
            <h1 className="videon-spread__headline">Video</h1>
          </header>
          <Text role="body" as="p">
            Öffne ein Video aus der Mediathek oder wähle zuerst eine Collection.
          </Text>
          <Link href={paths.routes.collections}>
            <Button variant="primary">Collection wählen</Button>
          </Link>
        </article>
      </AppShell>
    )
  }

  return (
    <AppShell description={`Video-Editor · ${mediaAssetId}`}>
      <article className="videon-hub videon-hub--wide">
        <header className="videon-hub__header-row">
          <div>
            <p className="videon-spread__eyebrow">Editor</p>
            <h1 className="videon-spread__headline">Video</h1>
          </div>
          <Link href={paths.routes.libraryFor(platformProjectId)}>
            <Button variant="ghost">Zur Mediathek</Button>
          </Link>
        </header>
        <MediaEditorView platformProjectId={platformProjectId} mediaAssetId={mediaAssetId} />
      </article>
    </AppShell>
  )
}
