'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button, EmptyState, Text } from '@msqdx/ui'
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

export function HomeMagazine() {
  return (
    <article className="videon-magazine videon-magazine--home" data-section="home-magazine">
      <header className="videon-home-cover">
        <h1 className="videon-home-cover__title">{paths.brandLabel}</h1>
      </header>

      <HomeChapter
        eyebrow="Start"
        title="Collection-Video-Arbeitsfläche"
        deck="Mediathek, Analysen und Cuts bleiben Collection-gebunden — geöffnet aus PLEXON."
      >
        <div className="videon-home-cta-row" role="group" aria-label="VIDEON Kapazitäten">
          <Link href={paths.routes.collections} className="videon-capability-tile videon-home-cta">
            <span className="videon-capability-tile__kicker">Zugang</span>
            <span className="videon-capability-tile__label">Collections</span>
            <span className="videon-capability-tile__deck">
              Nur zugewiesene PLEXON Collections — Access Model B.
            </span>
          </Link>
          <Link href={paths.routes.library} className="videon-capability-tile videon-home-cta">
            <span className="videon-capability-tile__kicker">Medien</span>
            <span className="videon-capability-tile__label">Mediathek</span>
            <span className="videon-capability-tile__deck">
              Collection-scoped Assets und signierte Uploads.
            </span>
          </Link>
          <Link href={paths.routes.analyses} className="videon-capability-tile videon-home-cta">
            <span className="videon-capability-tile__kicker">Vision</span>
            <span className="videon-capability-tile__label">Analysen</span>
            <span className="videon-capability-tile__deck">
              Startet automatisch nach Upload — OpenRouter / Qwen mit Schema-Fallback.
            </span>
          </Link>
        </div>
      </HomeChapter>

      <HomeChapter
        eyebrow="Aktivität"
        title="Zuletzt in der Collection"
        deck="Sobald Medien und Runs persistiert sind, erscheinen sie hier."
      >
        <div className="videon-home-run-columns" aria-label="Letzte Aktivität">
          <div className="videon-home-run-col">
            <h3 className="videon-home-run-col__title">Medien</h3>
            <EmptyState className="videon-home-empty">
              <Text role="body">Noch keine Assets.</Text>
              <Link href={paths.routes.library}>
                <Button variant="ghost">Zur Mediathek</Button>
              </Link>
            </EmptyState>
          </div>
          <div className="videon-home-run-col">
            <h3 className="videon-home-run-col__title">Analysen</h3>
            <EmptyState className="videon-home-empty">
              <Text role="body">Noch keine Vision-Runs.</Text>
              <Link href={paths.routes.analyses}>
                <Button variant="ghost">Analysen öffnen</Button>
              </Link>
            </EmptyState>
          </div>
          <div className="videon-home-run-col">
            <h3 className="videon-home-run-col__title">Cuts</h3>
            <EmptyState className="videon-home-empty">
              <Text role="body">Noch keine Cuts.</Text>
              <Link href={paths.routes.cuts}>
                <Button variant="ghost">Cuts öffnen</Button>
              </Link>
            </EmptyState>
          </div>
        </div>
      </HomeChapter>
    </article>
  )
}
