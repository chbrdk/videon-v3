import Link from 'next/link'
import { Button, EmptyState, Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'
import { HubPageHeader } from '@/components/hub-page-header'
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
          <HubPageHeader eyebrow="Editor" title="Video" />
          <EmptyState>
            <Text role="body" as="p">
              Öffne ein Video aus der Mediathek oder wähle zuerst eine Collection.
            </Text>
            <Link href={paths.routes.collections}>
              <Button variant="primary">Collection wählen</Button>
            </Link>
          </EmptyState>
        </article>
      </AppShell>
    )
  }

  return (
    <AppShell editor>
      <article className="videon-hub videon-hub--wide videon-hub--editor">
        <div className="videon-hub__header-row videon-hub__header-row--editor">
          <Link href={paths.routes.libraryFor(platformProjectId)}>
            <Button variant="ghost">← Mediathek</Button>
          </Link>
        </div>
        <MediaEditorView platformProjectId={platformProjectId} mediaAssetId={mediaAssetId} />
      </article>
    </AppShell>
  )
}
