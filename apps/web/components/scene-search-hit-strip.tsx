'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
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
import { useToast } from '@msqdx/ui-client'
import { appendScenesToActiveCut } from '@/lib/active-cut-append'
import { readStoredActiveCut, type ActiveCutContext } from '@/lib/active-cut'
import { mediaFramePosterUrl } from '@/lib/media-frame-poster'
import { paths } from '@/lib/paths'
import {
  sceneHitAtMs,
  sceneHitDurationLabel,
  sceneHitOrdinalLabel,
  sceneHitTimingLabel,
  type SceneSearchHitModel,
} from '@/lib/scene-hit-model'
import { useFramePoster } from '@/lib/use-frame-poster'
import { useInViewOnce } from '@/lib/use-in-view'
import { useT } from '@/lib/user-prefs'

export type { SceneSearchHitModel }

function SceneHitShot({
  mediaAssetId,
  platformProjectId,
  atMs,
}: {
  mediaAssetId: string
  platformProjectId: string
  atMs: number
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>({ rootMargin: '120px 0px' })
  const frameUrl = inView ? mediaFramePosterUrl(mediaAssetId, platformProjectId, atMs) : null
  const { src: thumbnail } = useFramePoster(frameUrl)
  if (!thumbnail) {
    return <div ref={ref} className="videon-scene-hit-shot videon-scene-hit-shot--empty" aria-hidden />
  }
  return (
    <div ref={ref} className="videon-scene-hit-shot-wrap">
      {/* eslint-disable-next-line @next/next/no-img-element -- Frame API blob URL */}
      <img src={thumbnail} alt="" className="videon-scene-hit-shot" />
    </div>
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

function rangedHits(hits: SceneSearchHitModel[]) {
  return hits.filter(
    (hit) =>
      Boolean(hit.platformProjectId) &&
      typeof hit.startMs === 'number' &&
      typeof hit.endMs === 'number' &&
      (hit.endMs as number) > (hit.startMs as number),
  )
}

/**
 * Audion-style StepStrip teasers for scene search hits.
 * Calm fixed-size cards; activate opens the editor at the scene.
 * Optional append to active Cut (localStorage).
 */
export function SceneSearchHitStrip({ hits }: { hits: SceneSearchHitModel[] }) {
  const t = useT()
  const router = useRouter()
  const toast = useToast()
  const [activeCut, setActiveCut] = useState<ActiveCutContext | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    setActiveCut(readStoredActiveCut())
    const onStorage = () => setActiveCut(readStoredActiveCut())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const items = hits.filter((hit) => Boolean(hit.platformProjectId))
  const appendable = rangedHits(items)

  const appendOne = useCallback(
    async (hit: SceneSearchHitModel) => {
      setBusyKey(hit.id)
      const result = await appendScenesToActiveCut([
        {
          mediaAssetId: hit.mediaAssetId,
          startMs: hit.startMs as number,
          endMs: hit.endMs as number,
          sceneKey: hit.sceneKey,
          platformProjectId: hit.platformProjectId,
        },
      ])
      setBusyKey(null)
      if (!result.ok) {
        toast.push({ message: result.message, tone: 'error' })
        return
      }
      toast.push({
        message: t('chat.addedToCut', { name: result.activeCut.name, count: result.count }),
        tone: 'ok',
      })
    },
    [t, toast],
  )

  const appendAll = useCallback(async () => {
    setBusyKey('all')
    const result = await appendScenesToActiveCut(
      appendable.map((hit) => ({
        mediaAssetId: hit.mediaAssetId,
        startMs: hit.startMs as number,
        endMs: hit.endMs as number,
        sceneKey: hit.sceneKey,
        platformProjectId: hit.platformProjectId,
      })),
    )
    setBusyKey(null)
    if (!result.ok) {
      toast.push({ message: result.message, tone: 'error' })
      return
    }
    toast.push({
      message: t('chat.addedToCut', { name: result.activeCut.name, count: result.count }),
      tone: 'ok',
    })
  }, [appendable, t, toast])

  if (!items.length) return null

  return (
    <div className="videon-scene-hits-wrap">
      {activeCut && appendable.length > 0 ? (
        <div className="videon-scene-hits-actions">
          <Text role="meta" as="span">
            {t('chat.activeCut', { name: activeCut.name })}
          </Text>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busyKey !== null}
            onClick={() => void appendAll()}
          >
            {busyKey === 'all' ? t('chat.addingToCut') : t('chat.addAllToCut')}
          </Button>
        </div>
      ) : (
        <Text role="meta" as="p">
          {t('chat.needActiveCut')}
        </Text>
      )}
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
          const atMs = sceneHitAtMs(hit)
          const timing = sceneHitTimingLabel(hit)
          const duration = sceneHitDurationLabel(hit)
          const href = paths.routes.mediaFor(hit.mediaAssetId, hit.platformProjectId, {
            tMs: hit.startMs,
            sceneKey: hit.sceneKey,
          })
          const snippet = hit.searchText.trim()
          const sceneLabel = sceneHitOrdinalLabel(hit, idx, (n) => t('chat.hitSceneN', { n }))
          const label = [hit.mediaFilename, sceneLabel, timing].filter(Boolean).join(' · ')
          const canAppend =
            activeCut &&
            typeof hit.startMs === 'number' &&
            typeof hit.endMs === 'number' &&
            hit.endMs > hit.startMs

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

                  {canAppend ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyKey !== null}
                      onClick={(event) => {
                        event.stopPropagation()
                        void appendOne(hit)
                      }}
                    >
                      {busyKey === hit.id ? t('chat.addingToCut') : t('chat.addToCut')}
                    </Button>
                  ) : null}
                </div>
              </Panel>
            </StepStripItem>
          )
        })}
      </StepStrip>
    </div>
  )
}
