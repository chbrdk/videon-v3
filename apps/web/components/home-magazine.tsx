'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  HubIndexCard,
  LoadingText,
  RankedList,
  RankedRow,
  SectionChrome,
  Text,
} from '@msqdx/ui'
import { useActiveCollection } from '@/components/collection-context'
import { useAccessibleCollections } from '@/components/use-accessible-collections'
import { paths } from '../lib/paths'
import { useT } from '@/lib/user-prefs'

function HomeChapter({
  title,
  deck,
  children,
}: {
  title: string
  deck?: string
  children: ReactNode
}) {
  return (
    <section className="videon-home-chapter">
      <header className="videon-home-chapter__head">
        <SectionChrome title={title} quiet as="h2" />
        {deck ? (
          <Text role="body" as="p" className="videon-home-chapter__deck">
            {deck}
          </Text>
        ) : null}
      </header>
      {children}
    </section>
  )
}

type MediaItem = { id: string; originalFilename: string; lifecycleState: string }
type AnalysisItem = { id: string; mediaAssetId: string; mediaFilename: string; status: string }

export function HomeMagazine() {
  const t = useT()
  const { platformProjectId } = useActiveCollection()
  const { nameFor } = useAccessibleCollections()
  const collectionName = nameFor(platformProjectId)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!platformProjectId) {
      setMedia([])
      setAnalyses([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [mediaResponse, analysesResponse] = await Promise.all([
          fetch(`${paths.routes.apiMedia}?platformProjectId=${encodeURIComponent(platformProjectId)}`, {
            cache: 'no-store',
          }),
          fetch(`${paths.routes.apiAnalyses}?platformProjectId=${encodeURIComponent(platformProjectId)}`, {
            cache: 'no-store',
          }),
        ])
        const mediaBody = (await mediaResponse.json()) as { items?: MediaItem[] }
        const analysesBody = (await analysesResponse.json()) as { items?: AnalysisItem[] }
        if (!cancelled) {
          setMedia(mediaBody.items?.slice(0, 5) ?? [])
          setAnalyses(analysesBody.items?.slice(0, 5) ?? [])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [platformProjectId])

  const libraryHref = platformProjectId ? paths.routes.libraryFor(platformProjectId) : paths.routes.collections
  const uploadHref = platformProjectId ? paths.routes.uploadFor(platformProjectId) : paths.routes.collections
  const analysesHref = platformProjectId ? paths.routes.analysesFor(platformProjectId) : paths.routes.collections
  const cutsHref = platformProjectId ? paths.routes.cutsFor(platformProjectId) : paths.routes.collections

  return (
    <article className="videon-magazine videon-magazine--home" data-section="home-magazine">
      <header className="videon-home-cover">
        <Text role="display" as="h1" className="videon-home-cover__title">
          {paths.brandLabel}
        </Text>
      </header>

      <HomeChapter
        title={t('home.workspaceTitle')}
        deck={
          platformProjectId
            ? t('home.activeCollection', { name: collectionName || platformProjectId })
            : t('home.noCollection')
        }
      >
        {!platformProjectId ? (
          <EmptyState>
            <Text role="body" as="p">
              {t('home.pickCollectionBody')}
            </Text>
            <Link href={paths.routes.collections}>
              <Button variant="primary">{t('nav.chooseCollection')}</Button>
            </Link>
          </EmptyState>
        ) : (
          <ul className="ds-hub-index-grid videon-home-cta-row" aria-label={t('home.capabilitiesAria')}>
            <li>
              <HubIndexCard
                href={libraryHref}
                title={t('nav.library')}
                meta={t('home.libraryMeta')}
              />
            </li>
            <li>
              <HubIndexCard href={uploadHref} title={t('nav.upload')} meta={t('home.uploadMeta')} />
            </li>
            <li>
              <HubIndexCard
                href={analysesHref}
                title={t('nav.analyses')}
                meta={t('home.analysesMeta')}
              />
            </li>
            <li>
              <HubIndexCard href={cutsHref} title={t('nav.cuts')} meta={t('home.cutsMeta')} />
            </li>
          </ul>
        )}
      </HomeChapter>

      <HomeChapter
        title={t('home.recentTitle')}
        deck={platformProjectId ? t('home.recentDeck') : t('home.recentEmpty')}
      >
        <div className="videon-home-run-columns" aria-label={t('home.activityAria')}>
          <div className="videon-home-run-col">
            <SectionChrome title={t('home.mediaCol')} quiet as="h3" />
            {loading ? (
              <LoadingText>{t('common.loading')}</LoadingText>
            ) : media.length === 0 ? (
              <EmptyState className="videon-home-empty">
                <Text role="body">{t('home.noMedia')}</Text>
                <Link href={uploadHref}>
                  <Button variant="ghost">{t('home.startUpload')}</Button>
                </Link>
              </EmptyState>
            ) : (
              <RankedList>
                {media.map((item, index) => (
                  <RankedRow
                    key={item.id}
                    index={index + 1}
                    label={item.originalFilename}
                    secondary={item.lifecycleState}
                    href={paths.routes.mediaFor(item.id, platformProjectId!)}
                    linkComponent={Link}
                  />
                ))}
              </RankedList>
            )}
          </div>
          <div className="videon-home-run-col">
            <SectionChrome title={t('nav.analyses')} quiet as="h3" />
            {loading ? (
              <LoadingText>{t('common.loading')}</LoadingText>
            ) : analyses.length === 0 ? (
              <EmptyState className="videon-home-empty">
                <Text role="body">{t('home.noAnalyses')}</Text>
                <Link href={analysesHref}>
                  <Button variant="ghost">{t('home.openAnalyses')}</Button>
                </Link>
              </EmptyState>
            ) : (
              <RankedList>
                {analyses.map((item, index) => (
                  <RankedRow
                    key={item.id}
                    index={index + 1}
                    label={item.mediaFilename}
                    secondary={item.status}
                    href={paths.routes.mediaFor(item.mediaAssetId, platformProjectId!)}
                    linkComponent={Link}
                  />
                ))}
              </RankedList>
            )}
          </div>
          <div className="videon-home-run-col">
            <SectionChrome title={t('nav.cuts')} quiet as="h3" />
            <EmptyState className="videon-home-empty">
              <Text role="body">{t('home.cutsHint')}</Text>
              <Link href={cutsHref}>
                <Button variant="ghost">{t('home.openCuts')}</Button>
              </Link>
            </EmptyState>
          </div>
        </div>
      </HomeChapter>
    </article>
  )
}
