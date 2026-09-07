import {
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_SERVICE_SECRET_HEADER,
  PLEXON_USER_HEADER,
} from '@videon-v3/contracts'
import {
  aggregateBrandCheckStatuses,
  buildBrandCandidatePathMap,
} from '@/lib/brand-findings'
import { paths } from '@/lib/paths'
import { brandionApiUrl, plexonServiceSecret } from '@/lib/runtime-config'
import type { BrandCheckStatus } from '@/lib/db/brand-checks'

export type BrandionPackToken = {
  path: string
  type: string
  value: string
}

export type BrandionActivePack = {
  guidelineId: string | null
  platformProjectId: string
  tokens: BrandionPackToken[]
}

export type BrandionImageCheckResult = {
  status: BrandCheckStatus
  brandionRequestId: string | null
  result: Record<string, unknown>
  provenance: Record<string, unknown>
}

export type BrandionEvidenceFrame = {
  frameId: string
  timestampMs: number
  base64Jpeg: string
}

function brandionHeaders(userId?: string): HeadersInit {
  const secret = plexonServiceSecret()
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
    ...(secret ? { [PLEXON_SERVICE_SECRET_HEADER]: secret } : {}),
    ...(userId ? { [PLEXON_USER_HEADER]: userId } : {}),
  }
}

function asPackToken(value: unknown): BrandionPackToken | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.path !== 'string' || typeof record.type !== 'string') return null
  if (record.status === 'pending') return null
  const rawValue = record.value
  const tokenValue =
    typeof rawValue === 'string'
      ? rawValue
      : rawValue == null
        ? ''
        : JSON.stringify(rawValue)
  return { path: record.path, type: record.type, value: tokenValue }
}

export async function fetchBrandionActivePack(
  platformProjectId: string,
  options: { fetcher?: typeof fetch; userId?: string } = {},
): Promise<BrandionActivePack | null> {
  const base = brandionApiUrl()
  const secret = plexonServiceSecret()
  if (!base || !secret || !platformProjectId.trim()) return null

  const url = new URL(`${base}${paths.brandionActivePackPath}`)
  url.searchParams.set(paths.activePackQueryKey, platformProjectId)
  const fetcher = options.fetcher ?? fetch
  try {
    const response = await fetcher(url.toString(), {
      method: 'GET',
      headers: brandionHeaders(options.userId),
      signal: AbortSignal.timeout(8_000),
    })
    if (response.status === 404 || response.status === 204 || !response.ok) return null
    const body = (await response.json()) as { guidelineId?: unknown; tokens?: unknown }
    const tokens = Array.isArray(body.tokens)
      ? body.tokens.map(asPackToken).filter((token): token is BrandionPackToken => token != null)
      : []
    return {
      guidelineId: typeof body.guidelineId === 'string' ? body.guidelineId : null,
      platformProjectId,
      tokens,
    }
  } catch {
    return null
  }
}

function mapRunToStatus(run: {
  status?: string
  passed?: number
  failed?: number
  skipped?: number
}): BrandCheckStatus {
  if (run.status === 'failed') return 'fail'
  const failed = typeof run.failed === 'number' ? run.failed : 0
  const passed = typeof run.passed === 'number' ? run.passed : 0
  const skipped = typeof run.skipped === 'number' ? run.skipped : 0
  if (failed > 0) return 'fail'
  if (passed > 0) return 'pass'
  if (skipped > 0) return 'warn'
  return 'pass'
}

function asResultArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Calls Brandion guideline analysis-runs with a JPEG evidence frame. */
export async function checkSceneImageAgainstBrandion(input: {
  guidelineId: string
  platformProjectId: string
  sceneKey: string
  base64Jpeg: string
  brandCandidates: Array<{ text: string; kind: string; confidence: string }>
  tokens?: BrandionPackToken[]
  userId?: string
  fetcher?: typeof fetch
  fileName?: string
}): Promise<BrandionImageCheckResult> {
  const base = brandionApiUrl()
  const secret = plexonServiceSecret()
  if (!base || !secret) {
    return {
      status: 'queued_pending_brandion',
      brandionRequestId: null,
      result: {},
      provenance: { reason: 'brandion_unconfigured' },
    }
  }

  const pathMap = buildBrandCandidatePathMap(input.brandCandidates, input.tokens ?? [])
  const fetcher = input.fetcher ?? fetch
  const url = `${base}${paths.brandionAnalysisRunsPath(input.guidelineId)}`
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: brandionHeaders(input.userId),
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        input: {
          kind: 'image',
          base64: input.base64Jpeg,
          mimeType: 'image/jpeg',
          fileName: input.fileName ?? `${input.sceneKey}.jpg`,
          ocr: true,
        },
        includePending: false,
        ...(Object.keys(pathMap).length ? { pathMap } : {}),
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status === 401 || response.status === 403 || response.status >= 500) {
        return {
          status: 'queued_pending_brandion',
          brandionRequestId: null,
          result: { httpStatus: response.status, detail: detail.slice(0, 400) },
          provenance: { reason: 'brandion_upstream_retryable', httpStatus: response.status },
        }
      }
      return {
        status: 'warn',
        brandionRequestId: null,
        result: { httpStatus: response.status, detail: detail.slice(0, 400) },
        provenance: {
          reason: 'brandion_evaluate_rejected',
          httpStatus: response.status,
          brandCandidates: input.brandCandidates,
          pathMap,
        },
      }
    }

    const run = (await response.json()) as {
      id?: string
      status?: string
      passed?: number
      failed?: number
      skipped?: number
      results?: unknown
      observations?: unknown
      error?: string
    }

    return {
      status: mapRunToStatus(run),
      brandionRequestId: typeof run.id === 'string' ? run.id : null,
      result: {
        passed: run.passed ?? 0,
        failed: run.failed ?? 0,
        skipped: run.skipped ?? 0,
        runStatus: run.status ?? null,
        error: run.error ?? null,
        results: run.results ?? [],
        observationCount: Array.isArray(run.observations) ? run.observations.length : 0,
        pathMap,
      },
      provenance: {
        seam: 'videon.brand-compliance.v1',
        guidelineId: input.guidelineId,
        platformProjectId: input.platformProjectId,
        brandCandidates: input.brandCandidates,
        pathMap,
        api: 'brandion.analysis-runs.image',
      },
    }
  } catch (error) {
    return {
      status: 'queued_pending_brandion',
      brandionRequestId: null,
      result: {
        error: error instanceof Error ? error.message.slice(0, 240) : 'brandion_request_failed',
      },
      provenance: { reason: 'brandion_network_error' },
    }
  }
}

/**
 * Brandion image runs are single-frame; VIDEON checks up to N evidence frames and aggregates
 * worst-case (fail > pending > warn > skipped > pass).
 */
export async function checkSceneFramesAgainstBrandion(input: {
  guidelineId: string
  platformProjectId: string
  sceneKey: string
  frames: BrandionEvidenceFrame[]
  brandCandidates: Array<{ text: string; kind: string; confidence: string }>
  tokens?: BrandionPackToken[]
  userId?: string
  fetcher?: typeof fetch
}): Promise<BrandionImageCheckResult> {
  if (!input.frames.length) {
    return {
      status: 'queued_pending_brandion',
      brandionRequestId: null,
      result: {},
      provenance: { reason: 'evidence_frame_extract_failed' },
    }
  }

  if (input.frames.length === 1) {
    const only = input.frames[0]
    const single = await checkSceneImageAgainstBrandion({
      ...input,
      base64Jpeg: only.base64Jpeg,
      fileName: `${input.sceneKey}-${only.frameId}.jpg`,
    })
    return {
      ...single,
      result: {
        ...single.result,
        frameRuns: [
          {
            frameId: only.frameId,
            timestampMs: only.timestampMs,
            status: single.status,
            brandionRequestId: single.brandionRequestId,
          },
        ],
      },
      provenance: {
        ...single.provenance,
        evidenceFrameCount: 1,
        evidenceFrameIds: [only.frameId],
        evidenceTimestampsMs: [only.timestampMs],
        api: 'brandion.analysis-runs.image.multi',
      },
    }
  }

  const frameRuns: Array<{
    frameId: string
    timestampMs: number
    status: BrandCheckStatus
    brandionRequestId: string | null
  }> = []
  const mergedFindings: unknown[] = []
  let passed = 0
  let failed = 0
  let skipped = 0
  let pathMap: Record<string, string> = {}
  let firstProvenance: Record<string, unknown> = {}

  for (const frame of input.frames) {
    const check = await checkSceneImageAgainstBrandion({
      guidelineId: input.guidelineId,
      platformProjectId: input.platformProjectId,
      sceneKey: input.sceneKey,
      base64Jpeg: frame.base64Jpeg,
      brandCandidates: input.brandCandidates,
      tokens: input.tokens,
      userId: input.userId,
      fetcher: input.fetcher,
      fileName: `${input.sceneKey}-${frame.frameId}.jpg`,
    })
    if (!Object.keys(firstProvenance).length) firstProvenance = check.provenance
    frameRuns.push({
      frameId: frame.frameId,
      timestampMs: frame.timestampMs,
      status: check.status,
      brandionRequestId: check.brandionRequestId,
    })
    const framePassed = typeof check.result.passed === 'number' ? check.result.passed : 0
    const frameFailed = typeof check.result.failed === 'number' ? check.result.failed : 0
    const frameSkipped = typeof check.result.skipped === 'number' ? check.result.skipped : 0
    passed += framePassed
    failed += frameFailed
    skipped += frameSkipped
    for (const finding of asResultArray(check.result.results)) {
      if (finding && typeof finding === 'object') {
        mergedFindings.push({
          ...(finding as Record<string, unknown>),
          ruleId: `${frame.frameId}:${String((finding as { ruleId?: unknown }).ruleId ?? 'rule')}`,
          evidenceFrameId: frame.frameId,
        })
      }
    }
    if (check.result.pathMap && typeof check.result.pathMap === 'object') {
      pathMap = { ...pathMap, ...(check.result.pathMap as Record<string, string>) }
    }
  }

  const status = aggregateBrandCheckStatuses(frameRuns.map((run) => run.status))
  const primaryRun =
    frameRuns.find((run) => run.status === 'fail') ??
    frameRuns.find((run) => run.status === 'queued_pending_brandion') ??
    frameRuns.find((run) => run.brandionRequestId) ??
    frameRuns[0]

  return {
    status,
    brandionRequestId: primaryRun?.brandionRequestId ?? null,
    result: {
      passed,
      failed,
      skipped,
      results: mergedFindings,
      frameRuns,
      pathMap,
      observationCount: frameRuns.length,
    },
    provenance: {
      ...firstProvenance,
      seam: 'videon.brand-compliance.v1',
      guidelineId: input.guidelineId,
      platformProjectId: input.platformProjectId,
      brandCandidates: input.brandCandidates,
      pathMap,
      api: 'brandion.analysis-runs.image.multi',
      evidenceFrameCount: input.frames.length,
      evidenceFrameIds: input.frames.map((frame) => frame.frameId),
      evidenceTimestampsMs: input.frames.map((frame) => frame.timestampMs),
      frameStatuses: frameRuns.map((run) => run.status),
    },
  }
}
