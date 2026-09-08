'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  IconClock,
  IconHistory,
  IconProjects,
  IconText,
  IconVideo,
  Panel,
  SectionChrome,
  StepStrip,
  StepStripItem,
  Text,
} from '@msqdx/ui'
import { formatClock } from '@/lib/editor-time'
import { mediaStreamPlaybackUrl } from '@/lib/media-playback-url'
import { paths } from '@/lib/paths'
import { useClipThumbnail } from '@/lib/use-clip-thumbnail'
import { useT } from '@/lib/user-prefs'

export type SceneSearchHitModel = {
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

function hitAtMs(hit: SceneSearchHitModel): number {
  if (hit.startMs != null && hit.startMs >= 0) return hit.startMs
  if (hit.endMs != null) return Math.max(0, Math.floor(hit.endMs / 2))
  return 1000
}

function timingLabel(hit: SceneSearchHitModel): string | null {
  if (hit.startMs != null && hit.endMs != null) {
    return `${formatClock(hit.startMs)}–${formatClock(hit.endMs)}`
  }
  if (hit.startMs != null) return formatClock(hit.startMs)
  return null
}

function durationLabel(hit: SceneSearchHitModel): string | null {
  if (hit.startMs == null || hit.endMs == null || hit.endMs < hit.startMs) return null
  return formatClock(hit.endMs - hit.startMs)
}

function sceneOrdinalLabel(hit: SceneSearchHitModel, index: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const raw = hit.sceneKey?.trim()
  if (raw) {
    const match = raw.match(/(\d+)/)
    if (match) return t('chat.hitSceneN', { n: Number(match[1]) })
    return raw
  }
  return t('chat.hitSceneN', { n: index + 1 })
}

function SceneHitShot({
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
    return <div className="videon-scene-hit-shot videon-scene-hit-shot--empty" aria-hidden />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data-URL frame from clip thumbnail hook
    <img src={thumbnail} alt="" className="videon-scene-hit-shot" />
  )
}

function MetaRow({
  icon,
  children,
}: {
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="videon-scene-hit-row">
      <span className="videon-scene-hit-row-icon" aria-hidden>
        {icon}
      </span>
      <span className="videon-scene-hit-row-text">{children}</span>
    </div>
  )
}

/**
 * Audion-style StepStrip teasers for scene search hits.
 * Calm fixed-size cards; activate opens the editor at the scene.
 */
export function SceneSearchHitStrip({ hits }: { hits: SceneSearchHitModel[] }) {
  const t = useT()
  const router = useRouter()

  const items = hits.filter((hit) => Boolean(hit.platformProjectId))
  if (!items.length) return null

  return (
    <StepStrip
      className="videon-scene-hits"
      aria-label={t('chat.hitsAria')}
      scrollerLabel={t('chat.hitsAria')}
      header={
        <SectionChrome quiet title={t('chat.hitsTitle')} meta={String(items.length)} metaTone="accent" as="h3" />
      }
      hint={t('chat.hitsHint')}
    >
      {items.map((hit, idx) => {
        const atMs = hitAtMs(hit)
        const timing = timingLabel(hit)
        const duration = durationLabel(hit)
        const href = paths.routes.mediaFor(hit.mediaAssetId, hit.platformProjectId, {
          tMs: hit.startMs,
          sceneKey: hit.sceneKey,
        })
        const snippet = hit.searchText.trim()
        const sceneLabel = sceneOrdinalLabel(hit, idx, t)
        const label = [hit.mediaFilename, sceneLabel, timing].filter(Boolean).join(' · ')

        return (
          <StepStripItem
            key={hit.id}
            index={idx}
            className="videon-scene-hit-slide"
            label={label}
            onActivate={() => router.push(href)}
          >
            <Panel as="div" className="videon-scene-hit-panel">
              <SceneHitShot
                mediaAssetId={hit.mediaAssetId}
                platformProjectId={hit.platformProjectId}
                atMs={atMs}
              />

              <div className="videon-scene-hit-body">
                <Text role="headline" as="h4" className="videon-scene-hit-title">
                  {hit.mediaFilename}
                </Text>

                <div className="videon-scene-hit-facts" role="list">
                  <MetaRow icon={<IconVideo size={14} />}>
                    <span role="listitem">{sceneLabel}</span>
                  </MetaRow>
                  {timing ? (
                    <MetaRow icon={<IconClock size={14} />}>
                      <span role="listitem">{timing}</span>
                    </MetaRow>
                  ) : null}
                  {duration ? (
                    <MetaRow icon={<IconHistory size={14} />}>
                      <span role="listitem">{t('chat.hitDuration', { duration })}</span>
                    </MetaRow>
                  ) : null}
                  {hit.projectName ? (
                    <MetaRow icon={<IconProjects size={14} />}>
                      <span role="listitem">{hit.projectName}</span>
                    </MetaRow>
                  ) : null}
                  {snippet ? (
                    <MetaRow icon={<IconText size={14} />}>
                      <span role="listitem" className="videon-scene-hit-snippet">
                        {snippet.slice(0, 160)}
                      </span>
                    </MetaRow>
                  ) : null}
                </div>
              </div>
            </Panel>
          </StepStripItem>
        )
      })}
    </StepStrip>
  )
}
