/**
 * Collection Knowledge Pack client — VIDEON → plexon-v3 (`media_insights`).
 * Spec: specs/domain/media-insights-publish.md
 * Plexon SoT: collection-knowledge-pack · videon-integration § Knowledge Pack
 */

import {
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_SERVICE_SECRET_HEADER,
} from '@videon-v3/contracts'
import { buildSceneHitHref } from '@/lib/scene-hit-model'
import {
  isPlexonAuthConfigured,
  plexonAuthUrl,
  plexonBaseUrl,
  plexonServiceSecret,
} from '@/lib/runtime-config'

export type MediaInsightsSceneRef = {
  mediaAssetId: string
  sceneKey?: string | null
  title?: string | null
  href: string
  startMs?: number | null
}

export type MediaInsightsData = {
  summary: string | null
  highlights: string[]
  sceneRefs: MediaInsightsSceneRef[]
  mediaCount: number | null
  lastAnalysisAt: string | null
}

export type KnowledgePackResponse = {
  platformProjectId: string
  revision: number
  facets: {
    media_insights?: { data?: Record<string, unknown> }
  }
}

function plexonContractHeaders(secret: string): Record<string, string> {
  return {
    [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
    [PLEXON_SERVICE_SECRET_HEADER]: secret,
  }
}

function platformApiBase(): string {
  const auth = plexonAuthUrl().replace(/\/$/, '')
  if (auth) return auth
  return plexonBaseUrl().replace(/\/$/, '')
}

function knowledgePath(platformProjectId: string): string {
  return `${platformApiBase()}/api/platform/projects/${encodeURIComponent(platformProjectId)}/knowledge`
}

function facetPublishPath(platformProjectId: string, facetId: string): string {
  return `${knowledgePath(platformProjectId)}/facets/${encodeURIComponent(facetId)}/publish`
}

export async function fetchCollectionKnowledgePack(
  platformProjectId: string,
): Promise<KnowledgePackResponse | null> {
  const id = platformProjectId.trim()
  if (!id || !isPlexonAuthConfigured()) return null
  const secret = plexonServiceSecret()
  try {
    const res = await fetch(knowledgePath(id), {
      method: 'GET',
      headers: { ...plexonContractHeaders(secret) },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn(
        '[VIDEON-v3] knowledge pack GET failed:',
        res.status,
        await res.text().catch(() => ''),
      )
      return null
    }
    return (await res.json()) as KnowledgePackResponse
  } catch (e) {
    console.warn('[VIDEON-v3] knowledge pack GET error:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Bound distillate for `media_insights` (caps from collection-knowledge-pack). */
export function distillMediaInsights(input: {
  platformProjectId: string
  mediaCount: number | null
  lastAnalysisAt: string | null
  highlights: string[]
  sceneRefs: Array<{
    mediaAssetId: string
    sceneKey?: string | null
    title?: string | null
    href?: string
    startMs?: number | null
  }>
  summary: string | null
}): MediaInsightsData {
  const platformProjectId = input.platformProjectId.trim()
  const highlights = [
    ...new Set(input.highlights.map((h) => h.trim()).filter(Boolean)),
  ].slice(0, 12)

  const sceneRefs: MediaInsightsSceneRef[] = []
  for (const ref of input.sceneRefs) {
    const mediaAssetId = ref.mediaAssetId?.trim()
    if (!mediaAssetId || !platformProjectId) continue
    const href =
      ref.href?.trim() ||
      buildSceneHitHref({
        mediaAssetId,
        platformProjectId,
        startMs: ref.startMs,
        sceneKey: ref.sceneKey,
      })
    sceneRefs.push({
      mediaAssetId,
      sceneKey: ref.sceneKey?.trim() || null,
      title: ref.title?.trim()?.slice(0, 160) || null,
      href,
      startMs: typeof ref.startMs === 'number' ? ref.startMs : null,
    })
    if (sceneRefs.length >= 20) break
  }

  return {
    summary: input.summary?.trim().slice(0, 2000) || null,
    highlights,
    sceneRefs,
    mediaCount: typeof input.mediaCount === 'number' ? input.mediaCount : null,
    lastAnalysisAt: input.lastAnalysisAt?.trim() || null,
  }
}

export async function publishMediaInsightsToPack(opts: {
  platformProjectId: string
  expectedRevision: number
  data: MediaInsightsData
  runId?: string | null
}): Promise<{ ok: true; revision: number } | { ok: false; status: number; error: string }> {
  if (!isPlexonAuthConfigured()) {
    return { ok: false, status: 503, error: 'plexon_not_configured' }
  }
  const secret = plexonServiceSecret()
  let expectedRevision = opts.expectedRevision
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(facetPublishPath(opts.platformProjectId, 'media_insights'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...plexonContractHeaders(secret),
        },
        body: JSON.stringify({
          mode: 'replace',
          expectedRevision,
          provenance: {
            actorType: 'service',
            productId: 'videon',
            runId: opts.runId ?? null,
            note: 'media insights distillate publish',
          },
          data: opts.data,
        }),
      })
      if (res.ok) {
        const body = (await res.json()) as { revision?: number }
        return { ok: true, revision: body.revision ?? expectedRevision + 1 }
      }
      if (res.status === 409 && attempt === 0) {
        const fresh = await fetchCollectionKnowledgePack(opts.platformProjectId)
        if (fresh) {
          expectedRevision = fresh.revision
          continue
        }
      }
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: text || res.statusText }
    }
    return { ok: false, status: 409, error: 'revision_conflict' }
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: e instanceof Error ? e.message : 'publish_failed',
    }
  }
}
