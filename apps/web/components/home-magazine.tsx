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

type MediaItem = {
  id: string
  originalFilename: string
  lifecycleState: string
  platformProjectId?: string
  projectName?: string | null
}
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
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const mediaUrl = platformProjectId
          ? paths.routes.apiMediaList(platformProjectId)
          : paths.routes.apiMediaListAccessible
        const fetches: Promise<Response>[] = [fetch(mediaUrl, { cache: 'no-store' })]
        if (platformProjectId) {
          fetches.push(
            fetch(
              `${paths.routes.apiAnalyses}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
              { cache: 'no-store' },
            ),
          )
        }
        const [mediaResponse, analysesResponse] = await Promise.all(fetches)
        const mediaBody = (await mediaResponse.json()) as { items?: MediaItem[] }
        const analysesBody = analysesResponse
          ? ((await analysesResponse.json()) as { items?: AnalysisItem[] })
          : { items: [] as AnalysisItem[] }
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

  const uploadHref = platformProjectId ? paths.routes.uploadFor(platformProjectId) : paths.routes.projects
  const analysesHref = platformProjectId
    ? paths.routes.analysesFor(platformProjectId)
    : paths.routes.projects

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
        <ul className="ds-hub-index-grid videon-home-cta-row" aria-label={t('home.capabilitiesAria')}>
          <li>
            <HubIndexCard href={paths.routes.chat} title={t('nav.chat')} meta={t('home.chatMeta')} />
          </li>
          <li>
            <HubIndexCard
              href={paths.routes.projects}
              title={t('nav.projects')}
              meta={t('home.projectsMeta')}
            />
          </li>
          <li>
            <HubIndexCard
              href={paths.routes.library}
              title={t('nav.library')}
              meta={t('home.libraryMeta')}
            />
          </li>
          <li>
            <HubIndexCard
              href={analysesHref}
              title={t('nav.analyses')}
              meta={t('home.analysesMeta')}
            />
          </li>
        </ul>
      </HomeChapter>

      <HomeChapter
        title={platformProjectId ? t('home.recentTitle') : t('home.recentTitleGlobal')}
        deck={platformProjectId ? t('home.recentDeck') : t('home.recentDeckGlobal')}
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
                {media.map((item, index) => {
                  const projectId = item.platformProjectId || platformProjectId
                  if (!projectId) return null
                  return (
                    <RankedRow
                      key={`${projectId}:${item.id}`}
                      index={index + 1}
                      label={item.originalFilename}
                      secondary={
                        item.projectName
                          ? `${item.projectName} · ${item.lifecycleState}`
                          : item.lifecycleState
                      }
                      href={paths.routes.mediaFor(item.id, projectId)}
                      linkComponent={Link}
                    />
                  )
                })}
              </RankedList>
            )}
          </div>
          <div className="videon-home-run-col">
            <SectionChrome title={t('nav.analyses')} quiet as="h3" />
            {loading ? (
              <LoadingText>{t('common.loading')}</LoadingText>
            ) : !platformProjectId ? (
              <EmptyState className="videon-home-empty">
                <Text role="body">{t('home.analysesNeedProject')}</Text>
                <Link href={paths.routes.projects}>
                  <Button variant="ghost">{t('nav.chooseCollection')}</Button>
                </Link>
              </EmptyState>
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
            <SectionChrome title={t('nav.chat')} quiet as="h3" />
            <EmptyState className="videon-home-empty">
              <Text role="body">{t('home.chatHint')}</Text>
              <Link href={paths.routes.chat}>
                <Button variant="ghost">{t('home.openChat')}</Button>
              </Link>
            </EmptyState>
          </div>
        </div>
      </HomeChapter>
    </article>
  )
}
