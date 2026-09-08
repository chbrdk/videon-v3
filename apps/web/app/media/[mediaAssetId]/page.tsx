import Link from 'next/link'
import { Button, EmptyState, Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'
import { HubPageHeader } from '@/components/hub-page-header'
import { MediaEditorView } from '@/components/media-editor-view'
import { paths } from '@/lib/paths'

type MediaPageProps = {
  params: Promise<{ mediaAssetId: string }>
  searchParams: Promise<{ platformProjectId?: string; t?: string; scene?: string }>
}

function parseSeekMs(raw: string | undefined): number | null {
  if (!raw?.trim()) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

export const dynamic = 'force-dynamic'

export default async function MediaDetailPage({ params, searchParams }: MediaPageProps) {
  const { mediaAssetId } = await params
  const query = await searchParams
  const platformProjectId = query.platformProjectId?.trim()
  const initialSeekMs = parseSeekMs(query.t)
  const initialSceneKey = query.scene?.trim() || null

  if (!platformProjectId) {
    return (
      <AppShell>
        <article className="videon-hub">
          <HubPageHeader eyebrow="Editor" title="Video" />
          <EmptyState>
            <Text role="body" as="p">
              Öffne ein Video aus der Mediathek oder wähle zuerst ein Projekt.
            </Text>
            <Link href={paths.routes.projects}>
              <Button variant="primary">Projekt wählen</Button>
            </Link>
          </EmptyState>
        </article>
      </AppShell>
    )
  }

  return (
    <AppShell editor>
      <article className="videon-hub videon-hub--wide videon-hub--editor">
        <MediaEditorView
          platformProjectId={platformProjectId}
          mediaAssetId={mediaAssetId}
          libraryHref={paths.routes.libraryFor(platformProjectId)}
          initialSeekMs={initialSeekMs}
          initialSceneKey={initialSceneKey}
        />
      </article>
    </AppShell>
  )
}
