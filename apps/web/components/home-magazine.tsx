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
import { paths } from '../lib/paths'

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
  const { platformProjectId } = useActiveCollection()
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
        title="Collection-Video-Arbeitsfläche"
        deck={
          platformProjectId
            ? `Aktive Collection: ${platformProjectId}`
            : 'Mediathek, Analysen und Cuts bleiben Collection-gebunden — geöffnet aus PLEXON.'
        }
      >
        <ul className="ds-hub-index-grid videon-home-cta-row" aria-label="VIDEON Kapazitäten">
          <li>
            <HubIndexCard
              href={paths.routes.collections}
              title="Collections"
              meta="Nur zugewiesene PLEXON Collections — Access Model B."
            />
          </li>
          <li>
            <HubIndexCard
              href={libraryHref}
              title="Mediathek"
              meta="Collection-scoped Assets und signierte Uploads."
            />
          </li>
          <li>
            <HubIndexCard
              href={uploadHref}
              title="Upload"
              meta="Direkt in Object Storage — Analyse startet nach Abschluss."
            />
          </li>
          <li>
            <HubIndexCard
              href={analysesHref}
              title="Analysen"
              meta="OpenRouter / Qwen mit Schema-Fallback und Szenen-Insights."
            />
          </li>
        </ul>
      </HomeChapter>

      <HomeChapter
        title="Zuletzt in der Collection"
        deck={
          platformProjectId
            ? 'Die letzten Medien und Vision-Runs dieser Collection.'
            : 'Wähle eine Collection, um Aktivität zu sehen.'
        }
      >
        <div className="videon-home-run-columns" aria-label="Letzte Aktivität">
          <div className="videon-home-run-col">
            <SectionChrome title="Medien" quiet as="h3" />
            {loading ? (
              <LoadingText>Lädt …</LoadingText>
            ) : media.length === 0 ? (
              <EmptyState className="videon-home-empty">
                <Text role="body">Noch keine Assets.</Text>
                <Link href={uploadHref}>
                  <Button variant="ghost">Upload starten</Button>
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
            <SectionChrome title="Analysen" quiet as="h3" />
            {loading ? (
              <LoadingText>Lädt …</LoadingText>
            ) : analyses.length === 0 ? (
              <EmptyState className="videon-home-empty">
                <Text role="body">Noch keine Vision-Runs.</Text>
                <Link href={analysesHref}>
                  <Button variant="ghost">Analysen öffnen</Button>
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
            <SectionChrome title="Cuts" quiet as="h3" />
            <EmptyState className="videon-home-empty">
              <Text role="body">Editor pro Medium in der Mediathek.</Text>
              <Link href={cutsHref}>
                <Button variant="ghost">Cuts öffnen</Button>
              </Link>
            </EmptyState>
          </div>
        </div>
      </HomeChapter>
    </article>
  )
}
