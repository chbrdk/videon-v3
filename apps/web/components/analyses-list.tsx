'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Text } from '@msqdx/ui'
import { PipelineStatusTrack } from '@/components/pipeline-status-track'
import type { PipelineStageSnapshot } from '@/lib/pipeline/pipeline-status'
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

  if (loading && items.length === 0) return <Text role="body">Analysen werden geladen …</Text>
  if (error) return <Text role="body">{error}</Text>
  if (items.length === 0) {
    return (
      <Text role="body">
        Noch keine Analysen. Lade ein Video hoch — die Pipeline startet automatisch nach dem Upload.
      </Text>
    )
  }

  return (
    <ul className="videon-media-list videon-media-list--analyses">
      {items.map((item) => (
        <li key={item.id} className="videon-media-list__item videon-media-list__item--analysis">
          <div className="videon-media-list__analysis-main">
            <Text role="title">{item.mediaFilename}</Text>
            <PipelineStatusTrack
              analysis={{
                status: item.status,
                startedAt: item.startedAt ?? null,
                finishedAt: item.finishedAt,
              }}
              stages={item.stages ?? []}
              mediaLifecycleState={item.mediaLifecycleState}
              showLifecycle
              variant="compact"
            />
          </div>
          <Link href={paths.routes.mediaFor(item.mediaAssetId, platformProjectId)}>
            <Button variant="ghost">Im Editor öffnen</Button>
          </Link>
        </li>
      ))}
    </ul>
  )
}
