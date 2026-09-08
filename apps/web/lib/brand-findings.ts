import type { BrandCheckStatus } from '@/lib/db/brand-checks'

/** Brandion accepts one image per analysis-run; VIDEON sends up to this many frames per scene. */
export const MAX_BRAND_EVIDENCE_FRAMES = 3

export type BrandEvidenceFrameRef = { id: string; timestampMs: number }

export type BrandFinding = {
  ruleId: string
  name: string
  passed: boolean
  severity: string
  message: string
  skipped: boolean
  subjectValue?: string | null
  targetValue?: string | null
}

export type BrandCheckView = {
  sceneKey: string
  status: BrandCheckStatus
  brandionRequestId: string | null
  guidelineId: string | null
  reason: string | null
  hint: string | null
  evidenceFrameCount: number
  /** Timestamps of frames sent to Brandion (ms), when provenance recorded them. */
  evidenceTimestampsMs: number[]
  /** Per-evidence-frame Brandion status, aligned with evidenceTimestampsMs when present. */
  frameStatuses: BrandCheckStatus[]
  passed: number
  failed: number
  skipped: number
  findings: BrandFinding[]
  /** Slim measured observations from Brandion (colors/text), when stored. */
  observations: Array<{ tokenPath: string; observedValue: string; field?: string; source?: string }>
  detail?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asFinding(value: unknown): BrandFinding | null {
  if (!isRecord(value)) return null
  if (typeof value.ruleId !== 'string' || typeof value.name !== 'string') return null
  if (typeof value.passed !== 'boolean' || typeof value.message !== 'string') return null
  return {
    ruleId: value.ruleId,
    name: value.name,
    passed: value.passed,
    severity: typeof value.severity === 'string' ? value.severity : 'info',
    message: value.message,
    skipped: value.skipped === true,
    subjectValue: typeof value.subjectValue === 'string' ? value.subjectValue : null,
    targetValue: typeof value.targetValue === 'string' ? value.targetValue : null,
  }
}

const TOKEN_COVERAGE_RULE_PREFIX = 'tcov:'

/** Brandion UI filters absent tokens out of findings (not a compliance failure). */
function isTokenAbsentFromDocument(item: Record<string, unknown>): boolean {
  return (
    item.status === 'not_found' &&
    typeof item.detectedValue !== 'string' &&
    typeof item.observationRef !== 'string'
  )
}

function humanTokenLabel(tokenPath: string): string {
  const leaf = tokenPath.split('.').filter(Boolean).at(-1)
  return leaf && leaf.length > 0 ? leaf : tokenPath
}

/**
 * Brandion FindingsWorkspace merges `tokenCoverage` into rule results
 * (`mergeResultsWithTokenCoverage`). VIDEON must do the same — otherwise
 * color/logo matches never appear in the inspect drawer.
 */
export function tokenCoverageToFindings(coverage: unknown): BrandFinding[] {
  if (!isRecord(coverage) || !Array.isArray(coverage.items)) return []
  const findings: BrandFinding[] = []
  for (const raw of coverage.items) {
    if (!isRecord(raw) || typeof raw.tokenPath !== 'string' || typeof raw.status !== 'string') continue
    if (raw.status === 'skipped' || isTokenAbsentFromDocument(raw)) continue
    if (raw.status !== 'matched' && raw.status !== 'partial' && raw.status !== 'not_found') continue

    const label = humanTokenLabel(raw.tokenPath)
    const detected = typeof raw.detectedValue === 'string' ? raw.detectedValue : null
    const expected = typeof raw.expectedValue === 'string' ? raw.expectedValue : null
    const passed = raw.status === 'matched'
    const severity =
      raw.status === 'partial' ? 'warning' : raw.status === 'not_found' ? 'error' : 'info'

    let message: string
    if (raw.status === 'matched') {
      message = detected ? `${label} stimmt (${detected})` : `${label} im Frame gefunden`
    } else if (raw.status === 'partial') {
      const delta =
        typeof raw.delta === 'number' && Number.isFinite(raw.delta)
          ? ` · ΔE ${raw.delta.toFixed(1)}`
          : ''
      message = `${label} teilweise — erwartet ${expected ?? '?'}, gemessen ${detected ?? '?'}${delta}`
    } else if (detected) {
      message = `${label} weicht ab — erwartet ${expected ?? '?'}, gemessen ${detected}`
    } else {
      message = `${label} nicht im Frame gefunden (erwartet ${expected ?? '?'})`
    }

    findings.push({
      ruleId: `${TOKEN_COVERAGE_RULE_PREFIX}${raw.tokenPath}`,
      name: label,
      passed,
      skipped: false,
      severity,
      message,
      subjectValue: detected,
      targetValue: expected,
    })
  }
  return findings
}

function tallyFindings(findings: BrandFinding[]): { passed: number; failed: number; skipped: number } {
  return {
    passed: findings.filter((f) => f.passed && !f.skipped).length,
    failed: findings.filter((f) => !f.passed && !f.skipped).length,
    skipped: findings.filter((f) => f.skipped).length,
  }
}

/** Downgrade-only status from merged findings (never invent a pass over Brandion fail). */
export function statusFromFindings(
  findings: BrandFinding[],
  fallback: BrandCheckStatus,
): BrandCheckStatus {
  if (findings.some((f) => !f.passed && !f.skipped && f.severity === 'error')) return 'fail'
  if (findings.some((f) => !f.passed && !f.skipped)) {
    return fallback === 'fail' ? 'fail' : 'warn'
  }
  if (findings.some((f) => f.passed && !f.skipped)) {
    return fallback === 'fail' || fallback === 'warn' || fallback === 'queued_pending_brandion'
      ? fallback
      : 'pass'
  }
  return fallback
}

/**
 * Prefer brand-candidate evidence frames, then remaining scene frames; dedupe + cap.
 * Falls back to a synthetic midpoint when no frame refs exist.
 */
export function selectBrandEvidenceRefs(input: {
  frameRefs: BrandEvidenceFrameRef[]
  brandCandidates: Array<{ evidenceFrameIds: string[] }>
  startMs: number
  endMs: number
  maxFrames?: number
}): BrandEvidenceFrameRef[] {
  const maxFrames = Math.max(1, input.maxFrames ?? MAX_BRAND_EVIDENCE_FRAMES)
  const byId = new Map(input.frameRefs.map((frame) => [frame.id, frame]))
  const selected: BrandEvidenceFrameRef[] = []
  const seenIds = new Set<string>()
  const seenTimestamps = new Set<number>()

  const push = (frame: BrandEvidenceFrameRef | undefined) => {
    if (!frame || selected.length >= maxFrames) return
    if (seenIds.has(frame.id) || seenTimestamps.has(frame.timestampMs)) return
    seenIds.add(frame.id)
    seenTimestamps.add(frame.timestampMs)
    selected.push(frame)
  }

  for (const candidate of input.brandCandidates) {
    for (const frameId of candidate.evidenceFrameIds) {
      push(byId.get(frameId))
    }
  }
  for (const frame of [...input.frameRefs].sort((a, b) => a.timestampMs - b.timestampMs)) {
    push(frame)
  }

  if (selected.length === 0) {
    return [
      {
        id: 'scene-mid',
        timestampMs: Math.floor((input.startMs + input.endMs) / 2),
      },
    ]
  }

  return selected.sort((a, b) => a.timestampMs - b.timestampMs)
}

/** Worst-case aggregation across per-frame Brandion runs (never upgrades to pass). */
export function aggregateBrandCheckStatuses(statuses: BrandCheckStatus[]): BrandCheckStatus {
  if (!statuses.length) return 'queued_pending_brandion'
  if (statuses.some((status) => status === 'fail')) return 'fail'
  if (statuses.some((status) => status === 'queued_pending_brandion' || status === 'running')) {
    return 'queued_pending_brandion'
  }
  if (statuses.some((status) => status === 'warn')) return 'warn'
  if (statuses.some((status) => status === 'skipped')) return 'skipped'
  return 'pass'
}

/** Normalize stored brand-check JSON into a UI-friendly view. */
export function toBrandCheckView(input: {
  sceneKey: string
  status: BrandCheckStatus
  brandionRequestId: string | null
  result: unknown
  provenance: unknown
}): BrandCheckView {
  const result = isRecord(input.result) ? input.result : {}
  const provenance = isRecord(input.provenance) ? input.provenance : {}
  const ruleFindings = Array.isArray(result.results)
    ? result.results.map(asFinding).filter((item): item is BrandFinding => item != null)
    : []
  // Coverage may already be merged into results at store time; still merge for older rows
  // that only kept tokenCoverage / for multi-frame aggregates that stash it separately.
  const coverageFindings = tokenCoverageToFindings(result.tokenCoverage)
  const seenRuleIds = new Set(ruleFindings.map((f) => f.ruleId))
  const findings = [
    ...ruleFindings,
    ...coverageFindings.filter((f) => !seenRuleIds.has(f.ruleId)),
  ]
  const tallied = tallyFindings(findings)
  const evidenceTimestampsMs = Array.isArray(provenance.evidenceTimestampsMs)
    ? provenance.evidenceTimestampsMs.filter((value): value is number => typeof value === 'number')
    : []
  const frameStatusesFromProvenance = Array.isArray(provenance.frameStatuses)
    ? provenance.frameStatuses.filter((value): value is BrandCheckStatus => typeof value === 'string')
    : []
  const frameStatusesFromRuns = Array.isArray(result.frameRuns)
    ? result.frameRuns
        .map((run) => (isRecord(run) && typeof run.status === 'string' ? (run.status as BrandCheckStatus) : null))
        .filter((value): value is BrandCheckStatus => value != null)
    : []
  const frameStatuses =
    frameStatusesFromProvenance.length > 0 ? frameStatusesFromProvenance : frameStatusesFromRuns
  const evidenceFrameCount =
    typeof provenance.evidenceFrameCount === 'number'
      ? provenance.evidenceFrameCount
      : evidenceTimestampsMs.length > 0
        ? evidenceTimestampsMs.length
        : frameStatuses.length > 0
          ? frameStatuses.length
          : 0

  // Prefer merged finding tallies when Brandion returned coverage-only signal
  // (rule passed/failed often stay 0 while tokenCoverage has matches).
  const useFindingTally =
    findings.length > 0 &&
    (coverageFindings.length > 0 ||
      typeof result.passed !== 'number' ||
      (result.passed === 0 && result.failed === 0 && result.skipped === 0 && tallied.passed + tallied.failed > 0))

  const observations = Array.isArray(result.observations)
    ? result.observations
        .map((raw) => {
          if (!isRecord(raw)) return null
          if (typeof raw.tokenPath !== 'string' || typeof raw.observedValue !== 'string') return null
          return {
            tokenPath: raw.tokenPath,
            observedValue: raw.observedValue,
            ...(typeof raw.field === 'string' ? { field: raw.field } : {}),
            ...(typeof raw.source === 'string' ? { source: raw.source } : {}),
          }
        })
        .filter((item): item is NonNullable<typeof item> => item != null)
        .slice(0, 32)
    : []

  return {
    sceneKey: input.sceneKey,
    status: statusFromFindings(findings, input.status),
    brandionRequestId: input.brandionRequestId,
    guidelineId: typeof provenance.guidelineId === 'string' ? provenance.guidelineId : null,
    reason: typeof provenance.reason === 'string' ? provenance.reason : null,
    hint: typeof provenance.hint === 'string' ? provenance.hint : null,
    evidenceFrameCount,
    evidenceTimestampsMs,
    frameStatuses,
    passed: useFindingTally
      ? tallied.passed
      : typeof result.passed === 'number'
        ? result.passed
        : tallied.passed,
    failed: useFindingTally
      ? tallied.failed
      : typeof result.failed === 'number'
        ? result.failed
        : tallied.failed,
    skipped: useFindingTally
      ? tallied.skipped
      : typeof result.skipped === 'number'
        ? result.skipped
        : tallied.skipped,
    findings,
    observations,
    detail: typeof result.detail === 'string' ? result.detail : typeof result.error === 'string' ? result.error : null,
  }
}

/**
 * Map vision brandCandidates onto Brandion token paths from the active pack.
 * Keys are OCR/logo hint strings Brandion may observe; values are guideline token paths.
 */
export function buildBrandCandidatePathMap(
  brandCandidates: Array<{ text: string; kind: string }>,
  tokens: Array<{ path: string; type: string; value: string }>,
): Record<string, string> {
  const pathMap: Record<string, string> = {}
  if (!brandCandidates.length || !tokens.length) return pathMap

  const contentish = tokens.filter(
    (token) =>
      token.type === 'content' ||
      token.type === 'asset' ||
      token.path.startsWith('content.') ||
      token.path.startsWith('asset.') ||
      token.path.startsWith('logo.'),
  )

  for (const candidate of brandCandidates) {
    const needle = candidate.text.trim().toLowerCase()
    if (!needle) continue
    const match = contentish.find((token) => {
      const value = token.value.trim().toLowerCase()
      const leaf = token.path.split('.').at(-1)?.toLowerCase() ?? ''
      return value.includes(needle) || needle.includes(value) || leaf.includes(needle) || needle.includes(leaf)
    })
    if (!match) continue
    pathMap[candidate.text] = match.path
    pathMap[candidate.text.toLowerCase()] = match.path
    pathMap[`text:${candidate.text}`] = match.path
    pathMap[`ocr:${candidate.text}`] = match.path
  }

  return pathMap
}
