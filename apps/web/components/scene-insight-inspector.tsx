'use client'

import {
  Badge,
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
  type StatusLevel,
} from '@msqdx/ui'
import { ChatCollapsible } from '@msqdx/ui-client'
import { TimelineClipThumbnail } from '@/components/timeline-clip-thumbnail'
import type { BrandCheckView, BrandFinding } from '@/lib/brand-findings'
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
  unchecked: 'Noch nicht geprüft',
  queued_pending_brandion: 'Wartet auf Brandion',
  running: 'Läuft',
  pass: 'Bestanden',
  warn: 'Warnung',
  fail: 'Nicht bestanden',
  skipped: 'Übersprungen',
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

function findingBadgeTone(finding: BrandFinding): BadgeTone {
  if (finding.skipped) return 'neutral'
  if (finding.passed) return 'success'
  return 'danger'
}

function EvidenceStrip(props: {
  playbackUrl: string | null
  frameRefs: SceneFrameRef[]
  evidenceFrameIds?: string[]
  timestampsMs?: number[]
}) {
  const byTimestamp = props.timestampsMs?.length
    ? props.timestampsMs
        .map((timestampMs) => {
          const match = props.frameRefs.find((frame) => frame.timestampMs === timestampMs)
          return match ?? { id: `ts-${timestampMs}`, timestampMs }
        })
        .filter((frame) => Number.isFinite(frame.timestampMs))
    : props.frameRefs.filter((frame) => (props.evidenceFrameIds ?? []).includes(frame.id))

  if (!byTimestamp.length || !props.playbackUrl) return null
  return (
    <div className="videon-scene-insight__evidence" data-testid="scene-evidence-strip">
      {byTimestamp.map((frame) => (
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

function EntityRow(props: {
  chip: string
  meta: string
  playbackUrl: string | null
  frameRefs: SceneFrameRef[]
  evidenceFrameIds: string[]
}) {
  return (
    <div className="videon-scene-inspect__entity">
      <Stack direction="row" gap="xs" wrap align="center">
        <Chip static size="sm">
          {props.chip}
        </Chip>
        {props.meta ? (
          <Text role="meta" as="span" className="videon-scene-inspect__entity-meta">
            {props.meta}
          </Text>
        ) : null}
      </Stack>
      <EvidenceStrip
        playbackUrl={props.playbackUrl}
        frameRefs={props.frameRefs}
        evidenceFrameIds={props.evidenceFrameIds}
      />
    </div>
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
  const brandStatus = brandCheck?.status ?? 'unchecked'
  const failedFindings = brandCheck?.findings.filter((f) => !f.passed && !f.skipped) ?? []
  const warnFindings = brandCheck?.findings.filter((f) => f.skipped) ?? []
  const passFindings = brandCheck?.findings.filter((f) => f.passed && !f.skipped) ?? []
  const orderedFindings = [...failedFindings, ...warnFindings, ...passFindings].slice(0, 24)

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
      <Stack direction="column" gap="sm" className="videon-scene-inspect__dense">
        <Text role="meta" as="p" className="videon-scene-inspect__summary">
          {insight.summary}
        </Text>

        <InspectSection title="Brand">
          <Stack direction="row" gap="xs" align="center" wrap className="videon-scene-inspect__brand-row">
            <StatusDot level={brandStatusLevel(brandStatus)} />
            <Chip static size="sm">
              {BRAND_STATUS_LABELS[brandStatus]}
            </Chip>
            {brandCheck && (brandCheck.failed > 0 || brandCheck.passed > 0 || brandCheck.skipped > 0) ? (
              <Badge tone={brandBadgeTone(brandStatus)}>
                {brandCheck.passed} ok · {brandCheck.failed} fail
                {brandCheck.skipped > 0 ? ` · ${brandCheck.skipped} skip` : ''}
              </Badge>
            ) : null}
          </Stack>

          {brandCheck?.guidelineId ? (
            <Text role="meta" as="p">
              Guideline: {brandCheck.guidelineId}
            </Text>
          ) : brandCheck?.reason === 'no_active_guideline' ? (
            <Text role="meta" as="p">
              Keine Guideline gebunden
            </Text>
          ) : null}

          {brandCheck?.brandionRequestId ? (
            <Text role="meta" as="p">
              Request: {brandCheck.brandionRequestId}
            </Text>
          ) : null}

          {brandCheck?.reason ? (
            <Text role="meta" as="p">
              {BRAND_REASON_LABELS[brandCheck.reason] ?? brandCheck.reason}
              {brandCheck.hint ? ` — ${brandCheck.hint}` : ''}
            </Text>
          ) : null}

          {brandCheck?.detail ? (
            <Text role="meta" as="p">
              {brandCheck.detail}
            </Text>
          ) : null}

          {brandCheck && brandCheck.evidenceFrameCount > 0 ? (
            <div className="videon-scene-inspect__brand-evidence">
              <Text role="meta" as="p">
                Evidence ({brandCheck.evidenceFrameCount}
                {brandCheck.frameStatuses.length
                  ? ` · ${brandCheck.frameStatuses.map((status) => BRAND_STATUS_LABELS[status] ?? status).join(', ')}`
                  : ''}
                )
              </Text>
              <EvidenceStrip
                playbackUrl={playbackUrl}
                frameRefs={frameRefs}
                timestampsMs={
                  brandCheck.evidenceTimestampsMs.length
                    ? brandCheck.evidenceTimestampsMs
                    : frameRefs.slice(0, brandCheck.evidenceFrameCount).map((frame) => frame.timestampMs)
                }
              />
            </div>
          ) : null}

          {insight.brandCandidates.length > 0 ? (
            <div className="videon-scene-inspect__brand-candidates">
              <Text role="meta" as="p">
                Vision-Hinweise
              </Text>
              <Stack direction="row" gap="xs" wrap>
                {insight.brandCandidates.map((candidate, index) => (
                  <Chip key={`${candidate.text}-${index}`} static size="sm">
                    {candidate.text}
                    <span className="videon-scene-inspect__chip-meta">
                      {' '}
                      · {candidate.kind} · {candidate.confidence}
                    </span>
                  </Chip>
                ))}
              </Stack>
            </div>
          ) : null}

          {brandCheck && brandCheck.observations.length > 0 ? (
            <div className="videon-scene-inspect__brand-candidates">
              <Text role="meta" as="p">
                Gemessen ({brandCheck.observations.length})
              </Text>
              <Stack direction="row" gap="xs" wrap>
                {brandCheck.observations.slice(0, 16).map((obs, index) => (
                  <Chip key={`${obs.tokenPath}-${obs.observedValue}-${index}`} static size="sm">
                    {obs.observedValue}
                    <span className="videon-scene-inspect__chip-meta">
                      {' '}
                      · {obs.tokenPath}
                      {obs.field ? `/${obs.field}` : ''}
                    </span>
                  </Chip>
                ))}
              </Stack>
            </div>
          ) : null}

          {orderedFindings.length > 0 ? (
            <ul className="videon-scene-inspect__findings">
              {orderedFindings.map((finding) => (
                <li key={finding.ruleId}>
                  <div className="videon-scene-inspect__finding-head">
                    <Badge tone={findingBadgeTone(finding)}>
                      {finding.skipped ? 'skip' : finding.passed ? 'pass' : 'fail'}
                    </Badge>
                    {finding.severity && finding.severity !== 'info' ? (
                      <Badge tone="neutral">{finding.severity}</Badge>
                    ) : null}
                    <Text role="meta" as="span" className="videon-scene-inspect__finding-name">
                      {finding.name}
                    </Text>
                  </div>
                  <Text role="meta" as="p">
                    {finding.message}
                  </Text>
                  {finding.subjectValue || finding.targetValue ? (
                    <Text role="meta" as="p">
                      {finding.subjectValue ?? '—'} → {finding.targetValue ?? '—'}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : brandStatus === 'unchecked' ? (
            <Text role="meta" as="p">
              Noch kein Brand-Check für diese Szene. Über „Mehr → Brand-Check“ starten.
            </Text>
          ) : brandCheck ? (
            <Text role="meta" as="p">
              Keine Regel- oder Token-Findings gespeichert. Brand-Check erneut starten, damit
              Brandion-Coverage (Farben, Typo, …) hier erscheint.
            </Text>
          ) : null}
        </InspectSection>

        <InspectSection title="Personen">
          {insight.people.length === 0 ? (
            <EmptyState>Keine Personen erkannt.</EmptyState>
          ) : (
            <Stack direction="column" gap="xs">
              {insight.people.map((person) => (
                <EntityRow
                  key={person.id}
                  chip={`${person.count}× ${person.role}`}
                  meta={[
                    AGE_LABELS[person.apparentAgeRange] ?? person.apparentAgeRange,
                    ...person.apparentPresentation,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  playbackUrl={playbackUrl}
                  frameRefs={frameRefs}
                  evidenceFrameIds={person.evidenceFrameIds}
                />
              ))}
            </Stack>
          )}
        </InspectSection>

        <InspectSection title="Objekte">
          {insight.objects.length === 0 ? (
            <EmptyState>Keine Objekte erkannt.</EmptyState>
          ) : (
            <Stack direction="column" gap="xs">
              {insight.objects.map((object) => (
                <EntityRow
                  key={object.id}
                  chip={`${object.count}× ${object.label}`}
                  meta={[object.category, ...object.attributes].filter(Boolean).join(' · ')}
                  playbackUrl={playbackUrl}
                  frameRefs={frameRefs}
                  evidenceFrameIds={object.evidenceFrameIds}
                />
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
                  <Text role="meta" as="span" className="videon-scene-inspect__action-label">
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
          <InspectSection title="Beobachtung">
            <Text role="meta" as="p">
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
