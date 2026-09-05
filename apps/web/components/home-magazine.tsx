'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, EmptyState, Text } from '@msqdx/ui'
import { useActiveCollection } from '@/components/collection-context'
import { paths } from '../lib/paths'

function HomeChapter({
  eyebrow,
  title,
  deck,
  children,
}: {
  eyebrow: string
  title: string
  deck?: string
  children: ReactNode
}) {
  return (
    <section className="videon-home-chapter">
      <header className="videon-home-chapter__head">
        <div>
          <p className="videon-spread__eyebrow">{eyebrow}</p>
          <h2 className="videon-spread__headline">{title}</h2>
          {deck ? <p className="videon-home-chapter__deck">{deck}</p> : null}
        </div>
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
        <h1 className="videon-home-cover__title">{paths.brandLabel}</h1>
      </header>

      <HomeChapter
        eyebrow="Start"
        title="Collection-Video-Arbeitsfläche"
        deck={
          platformProjectId
            ? `Aktive Collection: ${platformProjectId}`
            : 'Mediathek, Analysen und Cuts bleiben Collection-gebunden — geöffnet aus PLEXON.'
        }
      >
        <div className="videon-home-cta-row" role="group" aria-label="VIDEON Kapazitäten">
          <Link href={paths.routes.collections} className="videon-capability-tile videon-home-cta">
            <span className="videon-capability-tile__kicker">Zugang</span>
            <span className="videon-capability-tile__label">Collections</span>
            <span className="videon-capability-tile__deck">
              Nur zugewiesene PLEXON Collections — Access Model B.
            </span>
          </Link>
          <Link href={libraryHref} className="videon-capability-tile videon-home-cta">
            <span className="videon-capability-tile__kicker">Medien</span>
            <span className="videon-capability-tile__label">Mediathek</span>
            <span className="videon-capability-tile__deck">
              Collection-scoped Assets und signierte Uploads.
            </span>
          </Link>
          <Link href={uploadHref} className="videon-capability-tile videon-home-cta">
            <span className="videon-capability-tile__kicker">Ingest</span>
            <span className="videon-capability-tile__label">Upload</span>
            <span className="videon-capability-tile__deck">
              Direkt in Object Storage — Analyse startet nach Abschluss.
            </span>
          </Link>
          <Link href={analysesHref} className="videon-capability-tile videon-home-cta">
            <span className="videon-capability-tile__kicker">Vision</span>
            <span className="videon-capability-tile__label">Analysen</span>
            <span className="videon-capability-tile__deck">
              OpenRouter / Qwen mit Schema-Fallback und Szenen-Insights.
            </span>
          </Link>
        </div>
      </HomeChapter>

      <HomeChapter
        eyebrow="Aktivität"
        title="Zuletzt in der Collection"
        deck={
          platformProjectId
            ? 'Die letzten Medien und Vision-Runs dieser Collection.'
            : 'Wähle eine Collection, um Aktivität zu sehen.'
        }
      >
        <div className="videon-home-run-columns" aria-label="Letzte Aktivität">
          <div className="videon-home-run-col">
            <h3 className="videon-home-run-col__title">Medien</h3>
            {loading ? (
              <Text role="body">Lädt …</Text>
            ) : media.length === 0 ? (
              <EmptyState className="videon-home-empty">
                <Text role="body">Noch keine Assets.</Text>
                <Link href={uploadHref}>
                  <Button variant="ghost">Upload starten</Button>
                </Link>
              </EmptyState>
            ) : (
              <ul className="videon-home-activity-list">
                {media.map((item) => (
                  <li key={item.id}>
                    <Link href={paths.routes.mediaFor(item.id, platformProjectId!)}>
                      <Text role="headline" as="span">
                        {item.originalFilename}
                      </Text>
                      <Text role="meta" as="span">
                        {item.lifecycleState}
                      </Text>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="videon-home-run-col">
            <h3 className="videon-home-run-col__title">Analysen</h3>
            {loading ? (
              <Text role="body">Lädt …</Text>
            ) : analyses.length === 0 ? (
              <EmptyState className="videon-home-empty">
                <Text role="body">Noch keine Vision-Runs.</Text>
                <Link href={analysesHref}>
                  <Button variant="ghost">Analysen öffnen</Button>
                </Link>
              </EmptyState>
            ) : (
              <ul className="videon-home-activity-list">
                {analyses.map((item) => (
                  <li key={item.id}>
                    <Link href={paths.routes.mediaFor(item.mediaAssetId, platformProjectId!)}>
                      <Text role="headline" as="span">
                        {item.mediaFilename}
                      </Text>
                      <Text role="meta" as="span">
                        {item.status}
                      </Text>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="videon-home-run-col">
            <h3 className="videon-home-run-col__title">Cuts</h3>
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
