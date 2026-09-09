import { apiError, apiJson } from '@/lib/api-response'
import { hasDatabaseConfig } from '@/lib/db/client'
import { archiveMediaAssetForWorkspace } from '@/lib/db/media'
import {
  findLatestAnalysisForMedia,
  listSceneInsightsForAnalysis,
  listStagesForAnalysis,
} from '@/lib/db/analysis'
import { resolveMediaInWorkspace, resolveWorkspaceForMediaRequest } from '@/lib/media-access'
import { requireSessionUserId } from '@/lib/session-user'
import { findLatestTranscriptForMedia } from '@/lib/db/transcript'
import { listLatestAudioStemsForMedia } from '@/lib/db/media-stems'
import { findLatestWaveformPeaksForMedia } from '@/lib/db/media-waveform-peaks'
import { listBrandChecksForAnalysis } from '@/lib/db/brand-checks'
import { toBrandCheckView } from '@/lib/brand-findings'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ mediaAssetId: string }> }

function platformProjectIdFrom(request: Request): string {
  return new URL(request.url).searchParams.get('platformProjectId')?.trim() || ''
}

export async function GET(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const platformProjectId = platformProjectIdFrom(request)
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const { mediaAssetId } = await context.params
  const resolved = await resolveMediaInWorkspace({
    plexonUserId: userId,
    platformProjectId,
    mediaAssetId,
    detailed: true,
  })
  if (!resolved.ok) {
    const status =
      resolved.code === 'collection_access_denied' ? 403 : resolved.code === 'not_found' ? 404 : 503
    return apiError(request, status, resolved.code, 'Media asset unavailable', {
      retryable: resolved.code === 'dependency_unavailable',
    })
  }

  const analysis = await findLatestAnalysisForMedia(resolved.media.id)
  const stages = analysis ? await listStagesForAnalysis(analysis.id) : []
  const scenes = analysis ? await listSceneInsightsForAnalysis(analysis.id) : []
  const brandChecks = analysis ? await listBrandChecksForAnalysis(analysis.id) : []
  const transcript = await findLatestTranscriptForMedia(resolved.media.id)
  const stemRows = await listLatestAudioStemsForMedia(resolved.media.id)
  const voice = stemRows.find((stem) => stem.stemKind === 'voice')
  const music = stemRows.find((stem) => stem.stemKind === 'music')
  const mixPeaksRow = await findLatestWaveformPeaksForMedia(resolved.media.id)
  const mixPeaks = mixPeaksRow?.peaks ?? []
  const stems =
    voice || music || mixPeaks.length > 0
      ? {
          voicePeaks: voice?.peaks ?? [],
          musicPeaks: music?.peaks ?? [],
          mixPeaks,
          method: voice?.method ?? music?.method ?? mixPeaksRow?.method ?? null,
          voice: Boolean(voice),
          music: Boolean(music),
        }
      : null

  return apiJson(request, {
    media: resolved.media,
    analysis,
    stages,
    scenes,
    brandChecks: brandChecks.map((check) => toBrandCheckView(check)),
    transcript,
    stems,
  })
}

export async function DELETE(request: Request, context: RouteContext) {
  const userId = await requireSessionUserId()
  if (!userId) return apiError(request, 401, 'service_unauthorized', 'Authentication required')
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', {
      retryable: true,
    })
  }

  const platformProjectId = platformProjectIdFrom(request)
  if (!platformProjectId) {
    return apiError(request, 400, 'invalid_payload', 'platformProjectId is required')
  }

  const workspace = await resolveWorkspaceForMediaRequest({
    plexonUserId: userId,
    platformProjectId,
    writable: true,
  })
  if (!workspace.ok) {
    const status =
      workspace.code === 'collection_access_denied' ? 403 : workspace.code === 'not_found' ? 404 : 503
    return apiError(request, status, workspace.code, 'Collection workspace unavailable', {
      retryable: workspace.code === 'dependency_unavailable',
    })
  }

  const { mediaAssetId } = await context.params
  try {
    // V7 E4: soft-archive only. Object bytes + provenance remain until retention purge.
    const archived = await archiveMediaAssetForWorkspace(mediaAssetId.trim(), workspace.workspace.id)
    if (!archived) {
      return apiError(request, 404, 'not_found', 'Media asset not found')
    }

    return apiJson(request, {
      archived: true,
      deleted: true,
      mediaAssetId: mediaAssetId.trim(),
    })
  } catch (error) {
    console.error('[VIDEON] media DELETE (archive) failed', error)
    return apiError(
      request,
      500,
      'dependency_unavailable',
      error instanceof Error ? error.message : 'Media archive failed',
      { retryable: true },
    )
  }
}
