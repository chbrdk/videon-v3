'use client'

import type { ReactNode } from 'react'
import { Text } from '@msqdx/ui'
import { TimelineClipThumbnail } from '@/components/timeline-clip-thumbnail'
import type { BrandCheckView } from '@/lib/brand-findings'
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

const BRAND_STATUS_LABELS: Record<BrandCheckView['status'] | 'unchecked', string> = {
  unchecked: 'ungeprüft',
  queued_pending_brandion: 'wartet auf Brandion',
  running: 'läuft',
  pass: 'pass',
  warn: 'warn',
  fail: 'fail',
  skipped: 'übersprungen',
}

const BRAND_REASON_LABELS: Record<string, string> = {
  brandion_unconfigured: 'Brandion API nicht konfiguriert',
  no_active_guideline: 'Kein Active-Pack in Brandion',
  evidence_frame_extract_failed: 'Evidence-Frame konnte nicht extrahiert werden',
  brandion_upstream_retryable: 'Brandion vorübergehend nicht erreichbar',
  brandion_evaluate_rejected: 'Brandion hat die Prüfung abgelehnt',
  brandion_network_error: 'Netzwerkfehler zu Brandion',
}

const OBSERVED_LABELS: Record<SceneInsight['observedVsInferred'], string> = {
  observed_primary: 'überwiegend beobachtet',
  mixed: 'gemischt beobachtet/inferred',
  inferred_heavy: 'stark inferred',
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
  brandCheck?: BrandCheckView | null
}) {
  const { insight, frameRefs, playbackUrl } = props
  const brandCheck = props.brandCheck ?? null
  const brandStatus = brandCheck?.status ?? null
  const failedFindings = brandCheck?.findings.filter((finding) => !finding.passed && !finding.skipped) ?? []
  const warnFindings = brandCheck?.findings.filter((finding) => finding.skipped) ?? []
  const passFindings = brandCheck?.findings.filter((finding) => finding.passed && !finding.skipped) ?? []

  return (
    <div className="videon-scene-insight">
      <div className="videon-scene-insight__brand-row">
        <span className={`videon-scene-insight__brand-badge status-${brandStatus ?? 'unchecked'}`}>
          Brand: {BRAND_STATUS_LABELS[brandStatus ?? 'unchecked']}
          {brandCheck && (brandCheck.failed > 0 || brandCheck.passed > 0)
            ? ` · ${brandCheck.passed} ok / ${brandCheck.failed} fail`
            : ''}
        </span>
        {brandCheck?.guidelineId ? (
          <span className="videon-scene-insight__brand-meta">Guideline {brandCheck.guidelineId}</span>
        ) : brandCheck?.reason === 'no_active_guideline' ? (
          <span className="videon-scene-insight__brand-meta">keine Guideline gebunden</span>
        ) : null}
        {brandCheck && brandCheck.evidenceFrameCount > 0 ? (
          <span className="videon-scene-insight__brand-meta">
            {brandCheck.evidenceFrameCount} Evidence-Frame
            {brandCheck.evidenceFrameCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {brandCheck?.reason ? (
        <p className="videon-scene-insight__line">
          {BRAND_REASON_LABELS[brandCheck.reason] ?? brandCheck.reason}
          {brandCheck.hint ? ` — ${brandCheck.hint}` : ''}
        </p>
      ) : null}

      {brandCheck?.detail ? (
        <p className="videon-scene-insight__line">{brandCheck.detail}</p>
      ) : null}

      {brandCheck && brandCheck.findings.length > 0 ? (
        <FactSection title="Brandion Findings">
          <ul className="videon-scene-insight__list videon-scene-insight__findings">
            {[...failedFindings, ...warnFindings, ...passFindings].slice(0, 12).map((finding) => (
              <li
                key={finding.ruleId}
                className={`videon-scene-insight__finding is-${finding.skipped ? 'skip' : finding.passed ? 'pass' : 'fail'}`}
              >
                <strong>
                  {finding.skipped ? 'skip' : finding.passed ? 'pass' : 'fail'} · {finding.name}
                </strong>
                <span>{finding.message}</span>
                {finding.subjectValue || finding.targetValue ? (
                  <span>
                    {finding.subjectValue ?? '—'} → {finding.targetValue ?? '—'}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </FactSection>
      ) : null}

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

      <FactSection title="Aktionen">
        {insight.actions.length === 0 ? (
          <Text role="body">Keine Aktionen erkannt.</Text>
        ) : (
          <ul className="videon-scene-insight__list">
            {insight.actions.map((action, index) => (
              <li key={`${action.label}-${index}`}>
                <strong>{action.label}</strong>
                <span>
                  {formatClock(action.startMs)} – {formatClock(action.endMs)}
                  {action.actorIds.length ? ` · ${action.actorIds.join(', ')}` : ''}
                </span>
                <EvidenceStrip
                  playbackUrl={playbackUrl}
                  frameRefs={frameRefs}
                  evidenceFrameIds={action.evidenceFrameIds}
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

      <FactSection title="Beobachtung">
        <p className="videon-scene-insight__line">
          {OBSERVED_LABELS[insight.observedVsInferred] ?? insight.observedVsInferred}
        </p>
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
