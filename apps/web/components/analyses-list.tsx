'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LoadingText,
  RankedList,
  RankedRow,
  Text,
} from '@msqdx/ui'
import {
  analysisStatusLabel,
  analysisStatusTone,
  computePipelineProgress,
  mergeStagesWithPipeline,
  pipelineStageLabel,
  pipelineStatusHeadline,
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

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

function rowSecondary(item: AnalysisItem, stages: PipelineStageSnapshot[]): string {
  const analysis: AnalysisStatusSnapshot = {
    status: item.status,
    startedAt: item.startedAt ?? null,
    finishedAt: item.finishedAt,
  }
  const headline = pipelineStatusHeadline({
    analysis,
    stages,
    mediaLifecycleState: item.mediaLifecycleState,
  })
  const merged = mergeStagesWithPipeline(stages)
  const active = merged.find((stage) => stage.status === 'running')
  const stageBit = active
    ? pipelineStageLabel(active.stageKey)
    : item.failedStageKey
      ? pipelineStageLabel(item.failedStageKey)
      : null
  const when = formatWhen(item.finishedAt || item.startedAt || item.createdAt)
  return [stageBit, headline, when].filter(Boolean).join(' · ')
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
    <RankedList hint="Vision-Runs dieses Projekts — Detail und Stufen im Editor.">
      {items.map((item, index) => {
        const stages = item.stages ?? []
        const progress = computePipelineProgress(stages)
        return (
          <RankedRow
            key={item.id}
            index={index + 1}
            label={item.mediaFilename}
            value={
              <span className="ds-chip-row" style={{ gap: '0.35rem' }}>
                <Badge tone={analysisStatusTone(item.status)}>{analysisStatusLabel(item.status)}</Badge>
                <span className="ds-text-numeric">{progress}%</span>
              </span>
            }
            secondary={rowSecondary(item, stages)}
            barPct={progress}
            href={paths.routes.mediaFor(item.mediaAssetId, platformProjectId)}
            linkComponent={Link}
          />
        )
      })}
    </RankedList>
  )
}
