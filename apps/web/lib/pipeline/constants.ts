import { SCENE_INSIGHT_SCHEMA_VERSION } from '@/lib/vision-schema'

export const PIPELINE_VERSION = 'videon.pipeline.v1' as const

export const PIPELINE_STAGES = [
  'ingest',
  'probe',
  'scene_detect',
  'frame_sample',
  'audio',
  'vision',
  'aggregate',
  'index',
] as const

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]

export const ANALYSIS_JOB_NAME = 'videon.media.analysis' as const
export const EXPORT_JOB_NAME = 'videon.cut.export' as const

export const DEFAULT_REQUESTED_CAPABILITIES = ['probe', 'scene_detect', 'vision', 'aggregate'] as const

/** Optional neural voice/music stems (Demucs). Default analysis uses ffmpeg mid/side instead. */
export const STEM_DEMUCS_CAPABILITY = 'stems.demucs' as const

export function analysisInputFingerprint(checksumSha256: string): string {
  return `${PIPELINE_VERSION}:${SCENE_INSIGHT_SCHEMA_VERSION}:${checksumSha256}`
}

export function resolveRequestedCapabilities(extra: string[] = []): string[] {
  const merged = new Set<string>([...DEFAULT_REQUESTED_CAPABILITIES, ...extra])
  return [...merged]
}
