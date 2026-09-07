'use client'

import type { ReactNode } from 'react'
import { Text } from '@msqdx/ui'
import { TimelineClipThumbnail } from '@/components/timeline-clip-thumbnail'
import type { BrandCheckStatus } from '@/lib/db/brand-checks'
import type { SceneInsight } from '@/lib/vision-schema'
import { formatClock } from '@/lib/editor-time'

export type SceneFrameRef = { id: string; timestampMs: number }

const AGE_LABELS: Record<string, string> = {
  child: 'Kind',
  teen: 'Jugendlich',
  young_adult: 'Jung erwachsen',
  middle_adult: 'Mittelalt',
  older_adult: 'Älter',
  unknown: 'Unbekannt',
}

const BRAND_STATUS_LABELS: Record<BrandCheckStatus | 'unchecked', string> = {
  unchecked: 'ungeprüft',
  queued_pending_brandion: 'wartet auf Brandion',
  running: 'läuft',
  pass: 'pass',
  warn: 'warn',
  fail: 'fail',
  skipped: 'übersprungen',
}

function EvidenceStrip(props: {
  playbackUrl: string | null
  frameRefs: SceneFrameRef[]
  evidenceFrameIds: string[]
}) {
  const frames = props.frameRefs.filter((frame) => props.evidenceFrameIds.includes(frame.id))
  if (!frames.length || !props.playbackUrl) return null
  return (
    <div className="videon-scene-insight__evidence">
      {frames.map((frame) => (
        <div key={frame.id} className="videon-scene-insight__evidence-frame" title={frame.id}>
          <TimelineClipThumbnail playbackUrl={props.playbackUrl} sourceMs={frame.timestampMs} />
          <span>{formatClock(frame.timestampMs)}</span>
        </div>
      ))}
    </div>
  )
}

function FactSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="videon-scene-insight__section">
      <h3 className="videon-scene-insight__heading">{props.title}</h3>
      {props.children}
    </section>
  )
}

export function SceneInsightInspector(props: {
  insight: SceneInsight
  frameRefs: SceneFrameRef[]
  playbackUrl: string | null
  brandStatus?: BrandCheckStatus | null
}) {
  const { insight, frameRefs, playbackUrl } = props
  const brandStatus = props.brandStatus ?? null

  return (
    <div className="videon-scene-insight">
      <div className="videon-scene-insight__brand-row">
        <span className={`videon-scene-insight__brand-badge status-${brandStatus ?? 'unchecked'}`}>
          Brand: {BRAND_STATUS_LABELS[brandStatus ?? 'unchecked']}
        </span>
      </div>

      <FactSection title="Personen">
        {insight.people.length === 0 ? (
          <Text role="body">Keine Personen erkannt.</Text>
        ) : (
          <ul className="videon-scene-insight__list">
            {insight.people.map((person) => (
              <li key={person.id}>
                <strong>
                  {person.count}× {person.role}
                </strong>
                <span>
                  {AGE_LABELS[person.apparentAgeRange] ?? person.apparentAgeRange}
                  {person.apparentPresentation.length
                    ? ` · ${person.apparentPresentation.join(', ')}`
                    : ''}
                </span>
                <EvidenceStrip
                  playbackUrl={playbackUrl}
                  frameRefs={frameRefs}
                  evidenceFrameIds={person.evidenceFrameIds}
                />
              </li>
            ))}
          </ul>
        )}
      </FactSection>

      <FactSection title="Objekte">
        {insight.objects.length === 0 ? (
          <Text role="body">Keine Objekte erkannt.</Text>
        ) : (
          <ul className="videon-scene-insight__list">
            {insight.objects.map((object) => (
              <li key={object.id}>
                <strong>
                  {object.count}× {object.label}
                </strong>
                <span>
                  {object.category}
                  {object.attributes.length ? ` · ${object.attributes.join(', ')}` : ''}
                </span>
                <EvidenceStrip
                  playbackUrl={playbackUrl}
                  frameRefs={frameRefs}
                  evidenceFrameIds={object.evidenceFrameIds}
                />
              </li>
            ))}
          </ul>
        )}
      </FactSection>

      <FactSection title="Setting">
        <p className="videon-scene-insight__line">
          {insight.setting.location} · {insight.setting.timeOfDay}
          {insight.setting.environment.length
            ? ` · ${insight.setting.environment.join(', ')}`
            : ''}
        </p>
        {insight.setting.details.length ? (
          <p className="videon-scene-insight__line">{insight.setting.details.join(' · ')}</p>
        ) : null}
      </FactSection>

      <FactSection title="Komposition">
        <p className="videon-scene-insight__line">
          {insight.composition.shotType} · {insight.composition.cameraMotion}
          {insight.composition.dominantColors.length
            ? ` · ${insight.composition.dominantColors.join(', ')}`
            : ''}
        </p>
      </FactSection>

      <FactSection title="Marken-Hinweise">
        {insight.brandCandidates.length === 0 ? (
          <Text role="body">Keine Marken-Hinweise.</Text>
        ) : (
          <ul className="videon-scene-insight__list">
            {insight.brandCandidates.map((candidate, index) => (
              <li key={`${candidate.text}-${index}`}>
                <strong>{candidate.text}</strong>
                <span>
                  {candidate.kind} · {candidate.confidence}
                </span>
                <EvidenceStrip
                  playbackUrl={playbackUrl}
                  frameRefs={frameRefs}
                  evidenceFrameIds={candidate.evidenceFrameIds}
                />
              </li>
            ))}
          </ul>
        )}
      </FactSection>

      {insight.safetyFlags.length ? (
        <FactSection title="Safety">
          <p className="videon-scene-insight__line">{insight.safetyFlags.join(' · ')}</p>
        </FactSection>
      ) : null}

      {insight.mood.length ? (
        <FactSection title="Stimmung">
          <p className="videon-scene-insight__line">{insight.mood.join(' · ')}</p>
        </FactSection>
      ) : null}
    </div>
  )
}
