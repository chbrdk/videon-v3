/**
 * Distill + publish Collection `media_insights` after analysis.
 * Spec: specs/domain/media-insights-publish.md
 */

import { databasePool } from '@/lib/db/client'
import { listMediaForWorkspace } from '@/lib/db/media'
import { listRecentSearchEntriesForWorkspace } from '@/lib/db/search'
import { findWorkspaceById } from '@/lib/db/workspaces'
import {
  distillMediaInsights,
  fetchCollectionKnowledgePack,
  publishMediaInsightsToPack,
} from '@/lib/plexon-knowledge-pack'
import { isPlexonAuthConfigured } from '@/lib/runtime-config'
import { buildSceneHitHref } from '@/lib/scene-hit-model'

export type MediaInsightsPublishResult =
  | { ok: true; platformProjectId: string; revision: number; skipped?: never }
  | { ok: false; status: number; error: string; skipped?: boolean }

async function latestSucceededAnalysisAt(workspaceId: string): Promise<string | null> {
  const result = await databasePool().query<{ finished_at: Date | string | null }>(
    `select ar.finished_at
       from analysis_runs ar
       join media_assets ma on ma.id = ar.media_asset_id
      where ma.workspace_id = $1
        and ar.status = 'succeeded'
        and ar.finished_at is not null
      order by ar.finished_at desc
      limit 1`,
    [workspaceId],
  )
  const raw = result.rows[0]?.finished_at
  if (!raw) return null
  return new Date(raw).toISOString()
}

/**
 * Load recent search / scene index for a workspace Collection and publish a bounded distillate.
 */
export async function publishWorkspaceMediaInsights(input: {
  workspaceId: string
  /** Optional override when caller already resolved the Collection id. */
  platformProjectId?: string
  analysisRunId?: string | null
  soft?: boolean
}): Promise<MediaInsightsPublishResult> {
  const soft = Boolean(input.soft)

  if (!isPlexonAuthConfigured()) {
    return soft
      ? { ok: false, status: 503, error: 'plexon_not_configured', skipped: true }
      : { ok: false, status: 503, error: 'plexon_not_configured' }
  }

  const workspace = await findWorkspaceById(input.workspaceId)
  if (!workspace) {
    return { ok: false, status: 404, error: 'workspace_not_found' }
  }

  const platformProjectId = (input.platformProjectId ?? workspace.platformProjectId).trim()
  if (!platformProjectId) {
    return soft
      ? { ok: false, status: 422, error: 'no_collection', skipped: true }
      : { ok: false, status: 422, error: 'no_collection' }
  }

  const media = await listMediaForWorkspace(workspace.id)
  const entries = await listRecentSearchEntriesForWorkspace({ workspaceId: workspace.id, limit: 40 })
  const lastAnalysisAt = await latestSucceededAnalysisAt(workspace.id)

  const highlights: string[] = []
  const sceneRefs: Array<{
    mediaAssetId: string
    sceneKey?: string | null
    title?: string | null
    href: string
    startMs?: number | null
  }> = []

  for (const entry of entries) {
    const text = entry.searchText.trim()
    if (text && highlights.length < 12) {
      const bullet = text.slice(0, 160)
      if (!highlights.includes(bullet)) highlights.push(bullet)
    }
    if (entry.sceneKey && sceneRefs.length < 20) {
      sceneRefs.push({
        mediaAssetId: entry.mediaAssetId,
        sceneKey: entry.sceneKey,
        title: entry.mediaFilename,
        href: buildSceneHitHref({
          mediaAssetId: entry.mediaAssetId,
          platformProjectId,
          startMs: entry.startMs,
          sceneKey: entry.sceneKey,
        }),
        startMs: entry.startMs,
      })
    }
  }

  const summaryParts = [
    media.length ? `${media.length} media asset(s) in Collection` : null,
    highlights[0] ?? null,
  ].filter(Boolean)
  const summary = summaryParts.join('. ').slice(0, 2000) || null

  const data = distillMediaInsights({
    platformProjectId,
    mediaCount: media.length,
    lastAnalysisAt,
    highlights,
    sceneRefs,
    summary,
  })

  if (!data.summary && data.highlights.length === 0 && data.sceneRefs.length === 0) {
    return soft
      ? { ok: false, status: 422, error: 'empty_distillate', skipped: true }
      : { ok: false, status: 422, error: 'empty_distillate' }
  }

  const pack = await fetchCollectionKnowledgePack(platformProjectId)
  if (!pack) {
    return soft
      ? { ok: false, status: 502, error: 'pack_unavailable', skipped: true }
      : { ok: false, status: 502, error: 'pack_unavailable' }
  }

  const published = await publishMediaInsightsToPack({
    platformProjectId,
    expectedRevision: pack.revision,
    data,
    runId: input.analysisRunId ?? null,
  })
  if (!published.ok) {
    return {
      ok: false,
      status: published.status >= 400 ? published.status : 502,
      error: published.error,
      skipped: soft,
    }
  }

  return {
    ok: true,
    platformProjectId,
    revision: published.revision,
  }
}

/** Fire-and-forget after successful analysis (never fails the pipeline). */
export function scheduleMediaInsightsPublish(input: {
  workspaceId: string
  platformProjectId?: string
  analysisRunId?: string | null
}): void {
  void publishWorkspaceMediaInsights({ ...input, soft: true }).then((result) => {
    if (result.ok) {
      console.info(
        '[VIDEON-v3] media_insights publish ok',
        result.platformProjectId,
        `rev=${result.revision}`,
      )
      return
    }
    if (result.skipped) return
    console.warn('[VIDEON-v3] media_insights publish failed', result.error)
  })
}
