'use client'

import {
  Badge,
  ChatEntityGrid,
  ChatKeyValueList,
  Chip,
  Divider,
  EmptyState,
  InspectSection,
  ScrollArea,
  Stack,
  StatusDot,
  Text,
  Timecode,
  type BadgeTone,
  type ChatEntityItem,
  type StatusLevel,
} from '@msqdx/ui'
import { ChatCollapsible } from '@msqdx/ui-client'
import { TimelineClipThumbnail } from '@/components/timeline-clip-thumbnail'
import type { BrandCheckView } from '@/lib/brand-findings'
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

function brandStatusLevel(status: BrandCheckStatus | 'unchecked'): StatusLevel {
  if (status === 'fail') return 'critical'
  if (status === 'pass') return 'ok'
  if (status === 'warn' || status === 'running' || status === 'queued_pending_brandion') return 'warn'
  return 'warn'
}

function brandBadgeTone(status: BrandCheckStatus | 'unchecked'): BadgeTone {
  if (status === 'fail') return 'danger'
  if (status === 'pass') return 'success'
  if (status === 'warn') return 'warning'
  return 'neutral'
}

function findingBadgeTone(finding: { skipped: boolean; passed: boolean }): BadgeTone {
  if (finding.skipped) return 'neutral'
  if (finding.passed) return 'success'
  return 'danger'
}

function EvidenceStrip(props: {
  playbackUrl: string | null
  frameRefs: SceneFrameRef[]
  evidenceFrameIds: string[]
}) {
  const frames = props.frameRefs.filter((frame) => props.evidenceFrameIds.includes(frame.id))
  if (!frames.length || !props.playbackUrl) return null
  return (
    <div className="videon-scene-insight__evidence" data-testid="scene-evidence-strip">
      {frames.map((frame) => (
        <div key={frame.id} className="videon-scene-insight__evidence-frame" title={frame.id}>
          <TimelineClipThumbnail playbackUrl={props.playbackUrl} sourceMs={frame.timestampMs} />
          <Text role="meta" as="span">
            {formatClock(frame.timestampMs)}
          </Text>
        </div>
      ))}
    </div>
  )
}

function peopleToEntities(insight: SceneInsight): ChatEntityItem[] {
  return insight.people.map((person) => ({
    id: person.id,
    title: `${person.count}× ${person.role}`,
    subtitle: AGE_LABELS[person.apparentAgeRange] ?? person.apparentAgeRange,
    description: person.apparentPresentation.length
      ? person.apparentPresentation.join(', ')
      : undefined,
    badge: 'Person',
    accent: 'neutral' as const,
  }))
}

function objectsToEntities(insight: SceneInsight): ChatEntityItem[] {
  return insight.objects.map((object) => ({
    id: object.id,
    title: `${object.count}× ${object.label}`,
    subtitle: object.category,
    description: object.attributes.length ? object.attributes.join(', ') : undefined,
    badge: 'Objekt',
    accent: 'neutral' as const,
  }))
}

export function SceneInsightInspector(props: {
  insight: SceneInsight
  frameRefs: SceneFrameRef[]
  playbackUrl: string | null
  brandCheck?: BrandCheckView | null
}) {
  const { insight, frameRefs, playbackUrl } = props
  const brandCheck = props.brandCheck ?? null
  const brandStatus = brandCheck?.status ?? 'unchecked'
  const failedFindings = brandCheck?.findings.filter((f) => !f.passed && !f.skipped) ?? []
  const warnFindings = brandCheck?.findings.filter((f) => f.skipped) ?? []
  const passFindings = brandCheck?.findings.filter((f) => f.passed && !f.skipped) ?? []
  const orderedFindings = [...failedFindings, ...warnFindings, ...passFindings].slice(0, 12)

  const peopleEntities = peopleToEntities(insight)
  const objectEntities = objectsToEntities(insight)

  const settingItems = [
    { label: 'Ort', value: insight.setting.location },
    { label: 'Tageszeit', value: insight.setting.timeOfDay },
    ...(insight.setting.environment.length
      ? [{ label: 'Umgebung', value: insight.setting.environment.join(', ') }]
      : []),
    ...(insight.setting.details.length
      ? [{ label: 'Details', value: insight.setting.details.join(' · ') }]
      : []),
  ]

  const compositionItems = [
    { label: 'Shot', value: insight.composition.shotType },
    { label: 'Kamera', value: insight.composition.cameraMotion },
    ...(insight.composition.dominantColors.length
      ? [{ label: 'Farben', value: insight.composition.dominantColors.join(', ') }]
      : []),
  ]

  return (
    <ScrollArea
      className="videon-scene-inspect__detail"
      data-testid="scene-insight-inspector"
      aria-label="Szenen-Detail"
    >
      <Stack direction="column" gap="md">
        <Text role="body" as="p" className="videon-scene-inspect__summary">
          {insight.summary}
        </Text>

        <InspectSection title="Brand">
          <Stack direction="row" gap="sm" align="center" wrap className="videon-scene-inspect__brand-row">
            <StatusDot level={brandStatusLevel(brandStatus)} />
            <Chip static size="sm">
              {BRAND_STATUS_LABELS[brandStatus]}
            </Chip>
            {brandCheck && (brandCheck.failed > 0 || brandCheck.passed > 0) ? (
              <Badge tone={brandBadgeTone(brandStatus)}>
                {brandCheck.passed} ok / {brandCheck.failed} fail
              </Badge>
            ) : null}
            {brandCheck?.guidelineId ? (
              <Text role="meta" as="span">
                Guideline {brandCheck.guidelineId}
              </Text>
            ) : brandCheck?.reason === 'no_active_guideline' ? (
              <Text role="meta" as="span">
                keine Guideline gebunden
              </Text>
            ) : null}
            {brandCheck && brandCheck.evidenceFrameCount > 0 ? (
              <Text role="meta" as="span">
                {brandCheck.evidenceFrameCount} Evidence-Frame
                {brandCheck.evidenceFrameCount === 1 ? '' : 's'}
              </Text>
            ) : null}
          </Stack>
          {brandCheck?.reason ? (
            <Text role="meta" as="p">
              {BRAND_REASON_LABELS[brandCheck.reason] ?? brandCheck.reason}
              {brandCheck.hint ? ` — ${brandCheck.hint}` : ''}
            </Text>
          ) : null}
          {brandCheck?.detail ? (
            <Text role="body" as="p">
              {brandCheck.detail}
            </Text>
          ) : null}
          {orderedFindings.length > 0 ? (
            <ul className="videon-scene-inspect__findings">
              {orderedFindings.map((finding) => (
                <li key={finding.ruleId}>
                  <Badge tone={findingBadgeTone(finding)}>
                    {finding.skipped ? 'skip' : finding.passed ? 'pass' : 'fail'}
                  </Badge>
                  <Text role="body" as="span">
                    {finding.name}
                  </Text>
                  <Text role="meta" as="span">
                    {finding.message}
                  </Text>
                  {finding.subjectValue || finding.targetValue ? (
                    <Text role="meta" as="span">
                      {finding.subjectValue ?? '—'} → {finding.targetValue ?? '—'}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </InspectSection>

        <InspectSection title="Personen">
          {peopleEntities.length === 0 ? (
            <EmptyState>Keine Personen erkannt.</EmptyState>
          ) : peopleEntities.length >= 2 ? (
            <>
              <ChatEntityGrid items={peopleEntities} fullWidth />
              {insight.people.map((person) => (
                <EvidenceStrip
                  key={person.id}
                  playbackUrl={playbackUrl}
                  frameRefs={frameRefs}
                  evidenceFrameIds={person.evidenceFrameIds}
                />
              ))}
            </>
          ) : (
            <Stack direction="column" gap="sm">
              {insight.people.map((person) => (
                <div key={person.id}>
                  <Stack direction="row" gap="sm" wrap align="center">
                    <Chip static size="sm">
                      {person.count}× {person.role}
                    </Chip>
                    <Text role="meta" as="span">
                      {AGE_LABELS[person.apparentAgeRange] ?? person.apparentAgeRange}
                      {person.apparentPresentation.length
                        ? ` · ${person.apparentPresentation.join(', ')}`
                        : ''}
                    </Text>
                  </Stack>
                  <EvidenceStrip
                    playbackUrl={playbackUrl}
                    frameRefs={frameRefs}
                    evidenceFrameIds={person.evidenceFrameIds}
                  />
                </div>
              ))}
            </Stack>
          )}
        </InspectSection>

        <InspectSection title="Objekte">
          {objectEntities.length === 0 ? (
            <EmptyState>Keine Objekte erkannt.</EmptyState>
          ) : objectEntities.length >= 2 ? (
            <>
              <ChatEntityGrid items={objectEntities} fullWidth />
              {insight.objects.map((object) => (
                <EvidenceStrip
                  key={object.id}
                  playbackUrl={playbackUrl}
                  frameRefs={frameRefs}
                  evidenceFrameIds={object.evidenceFrameIds}
                />
              ))}
            </>
          ) : (
            <Stack direction="column" gap="sm">
              {insight.objects.map((object) => (
                <div key={object.id}>
                  <Stack direction="row" gap="sm" wrap align="center">
                    <Chip static size="sm">
                      {object.count}× {object.label}
                    </Chip>
                    <Text role="meta" as="span">
                      {object.category}
                      {object.attributes.length ? ` · ${object.attributes.join(', ')}` : ''}
                    </Text>
                  </Stack>
                  <EvidenceStrip
                    playbackUrl={playbackUrl}
                    frameRefs={frameRefs}
                    evidenceFrameIds={object.evidenceFrameIds}
                  />
                </div>
              ))}
            </Stack>
          )}
        </InspectSection>

        <InspectSection title="Aktionen">
          {insight.actions.length === 0 ? (
            <EmptyState>Keine Aktionen erkannt.</EmptyState>
          ) : (
            <ul className="videon-scene-inspect__actions">
              {insight.actions.map((action, index) => (
                <li key={`${action.label}-${index}`}>
                  <Text role="body" as="span">
                    {action.label}
                  </Text>
                  <Timecode
                    value={formatClock(action.startMs)}
                    secondary={formatClock(action.endMs)}
                    separator="–"
                  />
                  {action.actorIds.length ? (
                    <Text role="meta" as="span">
                      {action.actorIds.join(', ')}
                    </Text>
                  ) : null}
                  <EvidenceStrip
                    playbackUrl={playbackUrl}
                    frameRefs={frameRefs}
                    evidenceFrameIds={action.evidenceFrameIds}
                  />
                </li>
              ))}
            </ul>
          )}
        </InspectSection>

        <Divider />

        <ChatCollapsible title="Setting & Komposition" defaultOpen={false}>
          <InspectSection title="Setting">
            <ChatKeyValueList items={settingItems} />
          </InspectSection>
          <InspectSection title="Komposition">
            <ChatKeyValueList items={compositionItems} />
          </InspectSection>
        </ChatCollapsible>

        <ChatCollapsible title="Weitere Hinweise" defaultOpen={false}>
          <InspectSection title="Marken-Hinweise">
            {insight.brandCandidates.length === 0 ? (
              <EmptyState>Keine Marken-Hinweise.</EmptyState>
            ) : (
              <Stack direction="column" gap="sm">
                {insight.brandCandidates.map((candidate, index) => (
                  <div key={`${candidate.text}-${index}`}>
                    <Stack direction="row" gap="sm" wrap align="center">
                      <Chip static size="sm">
                        {candidate.text}
                      </Chip>
                      <Text role="meta" as="span">
                        {candidate.kind} · {candidate.confidence}
                      </Text>
                    </Stack>
                    <EvidenceStrip
                      playbackUrl={playbackUrl}
                      frameRefs={frameRefs}
                      evidenceFrameIds={candidate.evidenceFrameIds}
                    />
                  </div>
                ))}
              </Stack>
            )}
          </InspectSection>
          <InspectSection title="Beobachtung">
            <Text role="body" as="p">
              {OBSERVED_LABELS[insight.observedVsInferred] ?? insight.observedVsInferred}
            </Text>
          </InspectSection>
          {insight.safetyFlags.length ? (
            <InspectSection title="Safety">
              <Stack direction="row" gap="xs" wrap>
                {insight.safetyFlags.map((flag) => (
                  <Badge key={flag} tone="warning">
                    {flag}
                  </Badge>
                ))}
              </Stack>
            </InspectSection>
          ) : null}
          {insight.mood.length ? (
            <InspectSection title="Stimmung">
              <Stack direction="row" gap="xs" wrap>
                {insight.mood.map((mood) => (
                  <Chip key={mood} static size="sm">
                    {mood}
                  </Chip>
                ))}
              </Stack>
            </InspectSection>
          ) : null}
        </ChatCollapsible>
      </Stack>
    </ScrollArea>
  )
}
