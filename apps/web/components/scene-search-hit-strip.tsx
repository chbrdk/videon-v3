'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Panel, SectionChrome, StepStrip, StepStripItem, Text } from '@msqdx/ui'
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

function SceneHitShot({
  mediaAssetId,
  platformProjectId,
  atMs,
  expanded,
}: {
  mediaAssetId: string
  platformProjectId: string
  atMs: number
  expanded: boolean
}) {
  const playbackUrl = mediaStreamPlaybackUrl(mediaAssetId, platformProjectId)
  const thumbnail = useClipThumbnail(playbackUrl, atMs)
  if (!thumbnail) {
    return (
      <div
        className={`videon-scene-hit-shot videon-scene-hit-shot--empty${expanded ? ' videon-scene-hit-shot--expanded' : ''}`}
        aria-hidden
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data-URL frame from clip thumbnail hook
    <img
      src={thumbnail}
      alt=""
      className={`videon-scene-hit-shot${expanded ? ' videon-scene-hit-shot--expanded' : ''}`}
    />
  )
}

/**
 * Audion-style StepStrip teasers for scene search hits.
 * Hover/focus expands the frame; activate opens the editor at the scene.
 */
export function SceneSearchHitStrip({ hits }: { hits: SceneSearchHitModel[] }) {
  const t = useT()
  const router = useRouter()
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  useEffect(() => {
    if (expandedIdx == null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpandedIdx(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expandedIdx])

  const items = hits.filter((hit) => Boolean(hit.platformProjectId))
  if (!items.length) return null

  return (
    <StepStrip
      className="videon-scene-hits"
      aria-label={t('chat.hitsAria')}
      scrollerLabel={t('chat.hitsAria')}
      scrollToIndex={expandedIdx}
      header={
        <SectionChrome quiet title={t('chat.hitsTitle')} meta={String(items.length)} metaTone="accent" as="h3" />
      }
      hint={t('chat.hitsHint')}
    >
      {items.map((hit, idx) => {
        const expanded = expandedIdx === idx
        const atMs = hitAtMs(hit)
        const timing = timingLabel(hit)
        const href = paths.routes.mediaFor(hit.mediaAssetId, hit.platformProjectId, {
          tMs: hit.startMs,
          sceneKey: hit.sceneKey,
        })
        const snippet = hit.searchText.trim()
        const n = String(idx + 1).padStart(2, '0')
        const label = [hit.mediaFilename, hit.sceneKey, timing].filter(Boolean).join(' · ')

        return (
          <StepStripItem
            key={hit.id}
            index={idx}
            className={`videon-scene-hit-slide${expanded ? ' videon-scene-hit-slide--expanded' : ''}`}
            expanded={expanded}
            label={label}
            onActivate={() => router.push(href)}
            onPointerEnter={() => setExpandedIdx(idx)}
            onPointerLeave={() => setExpandedIdx((prev) => (prev === idx ? null : prev))}
            onFocus={() => setExpandedIdx(idx)}
          >
            <Panel as="div" className="videon-scene-hit-panel">
              <header className="videon-scene-hit-head">
                <span className="videon-scene-hit-num" aria-hidden>
                  {n}
                </span>
                <div className="videon-scene-hit-head-copy">
                  <Text role="label" className="videon-scene-hit-eyebrow">
                    {timing ?? t('chat.hitScene')}
                    {hit.sceneKey ? ` · ${hit.sceneKey}` : ''}
                  </Text>
                  <Text role="headline" as="h4" className="videon-scene-hit-title">
                    {hit.mediaFilename}
                  </Text>
                </div>
              </header>

              <SceneHitShot
                mediaAssetId={hit.mediaAssetId}
                platformProjectId={hit.platformProjectId}
                atMs={atMs}
                expanded={expanded}
              />

              <div className="videon-scene-hit-meta">
                {hit.projectName ? <Badge tone="neutral">{hit.projectName}</Badge> : null}
                {expanded && snippet ? (
                  <Text role="meta" as="p" className="videon-scene-hit-snippet">
                    {snippet.slice(0, 220)}
                  </Text>
                ) : null}
                <Text role="meta" as="span" className="videon-scene-hit-open-hint">
                  {expanded ? t('chat.hitOpenHint') : t('chat.hitHoverHint')}
                </Text>
              </div>
            </Panel>
          </StepStripItem>
        )
      })}
    </StepStrip>
  )
}
