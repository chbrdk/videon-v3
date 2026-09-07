'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Alert,
  Button,
  Chip,
  EmptyState,
  LoadingText,
  Meter,
  MeterList,
  StatusDot,
  StepStrip,
  StepStripItem,
  Text,
  type StatusLevel,
} from '@msqdx/ui'
import {
  analysisStatusLabel,
  computePipelineProgress,
  mediaLifecycleLabel,
  mergeStagesWithPipeline,
  pipelineStageHint,
  pipelineStageLabel,
  pipelineStatusHeadline,
  stageStatusLabel,
  type AnalysisStatusSnapshot,
  type PipelineStageSnapshot,
} from '@/lib/pipeline/pipeline-status'
import { paths } from '@/lib/paths'

type AnalysisItem = {
  id: string
  mediaAssetId: string
  status: string
  mediaFilename: string
  mediaLifecycleState: string
  createdAt: string
  finishedAt: string | null
  startedAt?: string | null
  failedStageKey?: string | null
  failedStageMessage?: string | null
  stages?: PipelineStageSnapshot[]
}

function statusLevel(status: string): StatusLevel {
  if (status === 'failed') return 'critical'
  if (status === 'running' || status === 'processing' || status === 'queued') return 'warn'
  return 'ok'
}

export function AnalysesList({ platformProjectId }: { platformProjectId: string }) {
  const [items, setItems] = useState<AnalysisItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `${paths.routes.apiAnalyses}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
        )
        const body = (await response.json()) as { items?: AnalysisItem[]; error?: { message?: string } }
        if (!response.ok) throw new Error(body.error?.message || 'Analysen konnten nicht geladen werden')
        if (!cancelled) setItems(body.items ?? [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Analysen konnten nicht geladen werden')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [platformProjectId])

  if (loading && items.length === 0) {
    return (
      <EmptyState>
        <LoadingText>Analysen werden geladen …</LoadingText>
      </EmptyState>
    )
  }
  if (error) {
    return (
      <EmptyState>
        <Alert tone="error">{error}</Alert>
      </EmptyState>
    )
  }
  if (items.length === 0) {
    return (
      <EmptyState>
        <Text role="title">Noch keine Analysen</Text>
        <Text role="body">
          Lade ein Video hoch — die Pipeline startet automatisch nach dem Upload.
        </Text>
        <Link href={paths.routes.uploadFor(platformProjectId)}>
          <Button variant="primary">Video hochladen</Button>
        </Link>
      </EmptyState>
    )
  }

  return (
    <ul className="videon-analyses-list" aria-label="Analysen">
      {items.map((item) => {
        const stages = item.stages ?? []
        const progress = computePipelineProgress(stages)
        const analysis: AnalysisStatusSnapshot = {
          status: item.status,
          startedAt: item.startedAt ?? null,
          finishedAt: item.finishedAt,
        }
        const merged = mergeStagesWithPipeline(stages)
        const headline = pipelineStatusHeadline({
          analysis,
          stages,
          mediaLifecycleState: item.mediaLifecycleState,
        })
        const activeIndex = merged.findIndex((stage) => stage.status === 'running')

        return (
          <li key={item.id} className="videon-analyses-list__item">
            <div className="videon-analyses-list__main">
              <div className="videon-analyses-list__head">
                <Text role="title" as="h3">
                  {item.mediaFilename}
                </Text>
                <div className="videon-analyses-list__chips">
                  <StatusDot level={statusLevel(item.status)} />
                  <Chip static size="sm">
                    {analysisStatusLabel(item.status)}
                  </Chip>
                  <Chip static size="sm">
                    {mediaLifecycleLabel(item.mediaLifecycleState)}
                  </Chip>
                </div>
              </div>
              <Text role="meta" as="p">
                {headline}
              </Text>
              <MeterList aria-label="Pipeline-Fortschritt">
                <Meter
                  label="Pipeline"
                  value={progress}
                  valueLabel={`${progress}%`}
                  disabled
                />
              </MeterList>
              <StepStrip
                aria-label="Pipeline-Stufen"
                scrollToIndex={activeIndex >= 0 ? activeIndex : null}
                hint={pipelineStageHint(merged[activeIndex]?.stageKey ?? merged[0]?.stageKey ?? 'probe')}
              >
                {merged.map((stage, index) => (
                  <StepStripItem
                    key={stage.stageKey}
                    index={index}
                    label={pipelineStageLabel(stage.stageKey)}
                    active={stage.status === 'running'}
                    selected={stage.status === 'succeeded'}
                  >
                    <Text role="label" as="span">
                      {pipelineStageLabel(stage.stageKey)}
                    </Text>
                    <Text role="meta" as="span">
                      {stageStatusLabel(stage.status)}
                    </Text>
                  </StepStripItem>
                ))}
              </StepStrip>
            </div>
            <Link href={paths.routes.mediaFor(item.mediaAssetId, platformProjectId)}>
              <Button variant="ghost">Im Editor öffnen</Button>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
