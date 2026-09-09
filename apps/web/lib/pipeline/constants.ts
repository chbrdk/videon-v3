import { SCENE_INSIGHT_SCHEMA_VERSION } from '@/lib/vision-schema'

export const PIPELINE_VERSION = 'videon.pipeline.v2' as const

export const PIPELINE_STAGES = [
  'ingest',
  'probe',
  'scene_detect',
  'frame_sample',
  'audio',
  'vision',
  'brand_compliance',
  'aggregate',
  'index',
] as const

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]

export const ANALYSIS_JOB_NAME = 'videon.media.analysis' as const
export const BRAND_COMPLIANCE_JOB_NAME = 'videon.media.brand_compliance' as const
export const EXPORT_JOB_NAME = 'videon.cut.export' as const
export const REFRAME_JOB_NAME = 'videon.media.reframe' as const

export const PROBE_CAPABILITY = 'probe' as const
export const SCENE_DETECT_CAPABILITY = 'scene_detect' as const
export const VISION_CAPABILITY = 'vision' as const
export const TRANSCRIPT_CAPABILITY = 'transcript' as const
export const STEM_DEMUCS_CAPABILITY = 'stems.demucs' as const
export const AGGREGATE_CAPABILITY = 'aggregate' as const

/** Upload auto-analysis: full core set without Demucs. */
export const DEFAULT_REQUESTED_CAPABILITIES = [
  PROBE_CAPABILITY,
  SCENE_DETECT_CAPABILITY,
  VISION_CAPABILITY,
  TRANSCRIPT_CAPABILITY,
  AGGREGATE_CAPABILITY,
] as const

const KNOWN_CAPABILITY_IDS = new Set<string>([
  PROBE_CAPABILITY,
  SCENE_DETECT_CAPABILITY,
  VISION_CAPABILITY,
  TRANSCRIPT_CAPABILITY,
  STEM_DEMUCS_CAPABILITY,
  AGGREGATE_CAPABILITY,
])

export type AnalysisUserBundleId = 'vision' | 'transcript' | 'stems' | 'aggregate'

export const ANALYSIS_USER_BUNDLES: ReadonlyArray<{
  id: AnalysisUserBundleId
  label: string
  description: string
  capabilities: readonly string[]
}> = [
  {
    id: 'vision',
    label: 'Szenen & Vision',
    description: 'Schnitte, Frames und KI-Szenenanalyse',
    capabilities: [SCENE_DETECT_CAPABILITY, VISION_CAPABILITY],
  },
  {
    id: 'transcript',
    label: 'Transkript',
    description: 'Spracherkennung der Tonspur',
    capabilities: [TRANSCRIPT_CAPABILITY],
  },
  {
    id: 'stems',
    label: 'Stems (Demucs)',
    description: 'Voice/Music-Trennung über den Stem-Worker',
    capabilities: [STEM_DEMUCS_CAPABILITY],
  },
  {
    id: 'aggregate',
    label: 'Zusammenfassung',
    description: 'Zusammenführung und Suchindex',
    capabilities: [AGGREGATE_CAPABILITY],
  },
] as const

const BUNDLE_BY_ID = new Map(ANALYSIS_USER_BUNDLES.map((bundle) => [bundle.id, bundle]))

const USER_FACING_CAPABILITY_IDS = new Set<string>([
  SCENE_DETECT_CAPABILITY,
  VISION_CAPABILITY,
  TRANSCRIPT_CAPABILITY,
  STEM_DEMUCS_CAPABILITY,
  AGGREGATE_CAPABILITY,
])

export function analysisInputFingerprint(checksumSha256: string): string {
  return `${PIPELINE_VERSION}:${SCENE_INSIGHT_SCHEMA_VERSION}:${checksumSha256}`
}

export class EmptyAnalysisCapabilitiesError extends Error {
  constructor(message = 'At least one analysis option must be selected') {
    super(message)
    this.name = 'EmptyAnalysisCapabilitiesError'
  }
}

/**
 * Expand bundle ids / capability ids into a canonical requested_capabilities list.
 * Always includes `probe`. Vision implies `scene_detect`. Does not re-add deselected work.
 */
export function normalizeRequestedCapabilities(selected: string[] = []): string[] {
  const expanded = new Set<string>()

  for (const raw of selected) {
    const token = String(raw || '').trim()
    if (!token) continue
    const bundle = BUNDLE_BY_ID.get(token as AnalysisUserBundleId)
    if (bundle) {
      for (const capability of bundle.capabilities) expanded.add(capability)
      continue
    }
    if (KNOWN_CAPABILITY_IDS.has(token)) {
      expanded.add(token)
    }
  }

  if (expanded.has(VISION_CAPABILITY)) {
    expanded.add(SCENE_DETECT_CAPABILITY)
  }

  expanded.add(PROBE_CAPABILITY)

  const hasUserWork = [...expanded].some((capability) => USER_FACING_CAPABILITY_IDS.has(capability))
  if (!hasUserWork) {
    throw new EmptyAnalysisCapabilitiesError()
  }

  const order = [
    PROBE_CAPABILITY,
    SCENE_DETECT_CAPABILITY,
    VISION_CAPABILITY,
    TRANSCRIPT_CAPABILITY,
    STEM_DEMUCS_CAPABILITY,
    AGGREGATE_CAPABILITY,
  ]
  return order.filter((capability) => expanded.has(capability))
}

/** @deprecated Prefer normalizeRequestedCapabilities — merges extras onto upload defaults. */
export function resolveRequestedCapabilities(extra: string[] = []): string[] {
  return normalizeRequestedCapabilities([...DEFAULT_REQUESTED_CAPABILITIES, ...extra])
}

export function capabilitiesWant(
  requestedCapabilities: string[] | null | undefined,
  capability: string,
): boolean {
  return Boolean(requestedCapabilities?.includes(capability))
}

export function selectedBundlesFromCapabilities(
  requestedCapabilities: string[] | null | undefined,
): AnalysisUserBundleId[] {
  const caps = new Set(requestedCapabilities ?? [])
  return ANALYSIS_USER_BUNDLES.filter((bundle) =>
    bundle.capabilities.every((capability) => caps.has(capability)),
  ).map((bundle) => bundle.id)
}
