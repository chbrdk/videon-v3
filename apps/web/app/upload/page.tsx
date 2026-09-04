import Link from 'next/link'
import { Button, Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'
import { MediaUploadForm } from '@/components/media-upload-form'
import { paths } from '@/lib/paths'

type UploadPageProps = {
  searchParams: Promise<{ platformProjectId?: string }>
}

export const dynamic = 'force-dynamic'

export default async function UploadPage({ searchParams }: UploadPageProps) {
  const params = await searchParams
  const platformProjectId = params.platformProjectId?.trim()

  if (!platformProjectId) {
    return (
      <AppShell description="Upload ist Collection-gebunden.">
        <article className="videon-hub">
          <header>
            <p className="videon-spread__eyebrow">Upload</p>
            <h1 className="videon-spread__headline">Video hochladen</h1>
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
    <AppShell description={`Signierter Upload in Collection ${platformProjectId}`}>
      <article className="videon-hub">
        <header className="videon-hub__header-row">
          <div>
            <p className="videon-spread__eyebrow">Upload</p>
            <h1 className="videon-spread__headline">Video hochladen</h1>
          </div>
          <Link href={paths.routes.libraryFor(platformProjectId)}>
            <Button variant="ghost">Zur Mediathek</Button>
          </Link>
        </header>
        <MediaUploadForm platformProjectId={platformProjectId} />
      </article>
    </AppShell>
  )
}
