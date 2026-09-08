'use client'

import { Badge, Card, Text } from '@msqdx/ui'
import { formatClock } from '@/lib/editor-time'
import { mediaStreamPlaybackUrl } from '@/lib/media-playback-url'
import { paths } from '@/lib/paths'
import { useClipThumbnail } from '@/lib/use-clip-thumbnail'

export type SceneSearchHitCardModel = {
  id: string
  mediaAssetId: string
  sceneKey: string | null
  searchText: string
  mediaFilename: string
  startMs: number | null
  endMs: number | null
  platformProjectId: string
  projectName?: string | null
}

function SceneHitThumb({
  mediaAssetId,
  platformProjectId,
  atMs,
}: {
  mediaAssetId: string
  platformProjectId: string
  atMs: number
}) {
  const playbackUrl = mediaStreamPlaybackUrl(mediaAssetId, platformProjectId)
  const thumbnail = useClipThumbnail(playbackUrl, atMs)
  if (!thumbnail) {
    return <div className="videon-media-card__thumb videon-media-card__thumb--empty" aria-hidden />
  }
  return (
    <div
      className="videon-media-card__thumb"
      style={{ backgroundImage: `url(${thumbnail})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      aria-hidden
    />
  )
}

function timingLabel(hit: SceneSearchHitCardModel): string | null {
  if (hit.startMs != null && hit.endMs != null) {
    return `${formatClock(hit.startMs)}–${formatClock(hit.endMs)}`
  }
  if (hit.startMs != null) return formatClock(hit.startMs)
  return null
}

/** Mediathek-style square Card for a scene search hit — deep-links with seek. */
export function SceneSearchHitCard({ hit }: { hit: SceneSearchHitCardModel }) {
  const atMs =
    hit.startMs != null && hit.startMs >= 0
      ? hit.startMs
      : hit.endMs != null
        ? Math.max(0, Math.floor(hit.endMs / 2))
        : 1000
  const href = paths.routes.mediaFor(hit.mediaAssetId, hit.platformProjectId, {
    tMs: hit.startMs,
    sceneKey: hit.sceneKey,
  })
  const timing = timingLabel(hit)
  const snippet = hit.searchText.trim().slice(0, 140)

  return (
    <Card
      className="videon-media-card"
      href={href}
      media={<SceneHitThumb mediaAssetId={hit.mediaAssetId} platformProjectId={hit.platformProjectId} atMs={atMs} />}
      title={hit.mediaFilename}
      meta={
        <>
          {hit.projectName ? <Badge tone="neutral">{hit.projectName}</Badge> : null}
          {hit.sceneKey ? <Badge tone="accent">{hit.sceneKey}</Badge> : null}
          {timing ? (
            <Text role="meta" as="span">
              {timing}
            </Text>
          ) : null}
          {snippet ? (
            <Text role="meta" as="span" className="videon-scene-hit-card__snippet">
              {snippet}
            </Text>
          ) : null}
        </>
      }
    />
  )
}
