import {
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_SERVICE_SECRET_HEADER,
  PLEXON_USER_HEADER,
} from '@videon-v3/contracts'
import { paths } from '@/lib/paths'
import { brandionApiUrl, plexonServiceSecret } from '@/lib/runtime-config'
import type { BrandCheckStatus } from '@/lib/db/brand-checks'

export type BrandionActivePack = {
  guidelineId: string | null
  platformProjectId: string
}

export type BrandionImageCheckResult = {
  status: BrandCheckStatus
  brandionRequestId: string | null
  result: Record<string, unknown>
  provenance: Record<string, unknown>
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
    const body = (await response.json()) as { guidelineId?: unknown }
    return {
      guidelineId: typeof body.guidelineId === 'string' ? body.guidelineId : null,
      platformProjectId,
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

/** Calls Brandion guideline analysis-runs with a JPEG evidence frame. */
export async function checkSceneImageAgainstBrandion(input: {
  guidelineId: string
  platformProjectId: string
  sceneKey: string
  base64Jpeg: string
  brandCandidates: Array<{ text: string; kind: string; confidence: string }>
  userId?: string
  fetcher?: typeof fetch
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
          fileName: `${input.sceneKey}.jpg`,
          ocr: input.brandCandidates.length > 0,
        },
        includePending: false,
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      // Transport/auth/config issues stay queued — never invent pass.
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
      },
      provenance: {
        seam: 'videon.brand-compliance.v1',
        guidelineId: input.guidelineId,
        platformProjectId: input.platformProjectId,
        brandCandidates: input.brandCandidates,
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
