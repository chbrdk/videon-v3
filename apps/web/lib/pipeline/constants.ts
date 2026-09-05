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

export const DEFAULT_REQUESTED_CAPABILITIES = ['probe', 'scene_detect', 'vision', 'aggregate'] as const

export function analysisInputFingerprint(checksumSha256: string): string {
  return `${PIPELINE_VERSION}:${SCENE_INSIGHT_SCHEMA_VERSION}:${checksumSha256}`
}
