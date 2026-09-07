import {
  DEFAULT_REQUESTED_CAPABILITIES,
  STEM_DEMUCS_CAPABILITY,
  normalizeRequestedCapabilities,
} from '@/lib/pipeline/constants'

export type AnalysisRequestBody = {
  capabilities?: string[]
  stemMethod?: string
}

/** Shared by POST /analysis and unit tests. */
export function resolveCapabilitiesFromAnalysisBody(body: AnalysisRequestBody): string[] {
  if (Array.isArray(body.capabilities)) {
    return normalizeRequestedCapabilities(body.capabilities)
  }
  const extras = body.stemMethod === 'demucs' ? [STEM_DEMUCS_CAPABILITY] : []
  return normalizeRequestedCapabilities([...DEFAULT_REQUESTED_CAPABILITIES, ...extras])
}
