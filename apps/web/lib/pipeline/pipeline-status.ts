import { PIPELINE_STAGES, type PipelineStageKey } from '@/lib/pipeline/constants'

export type PipelineStageStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'pending'

export type PipelineStageSnapshot = {
  stageKey: string
  status: PipelineStageStatus
  progressCompleted?: number
  progressTotal?: number
  errorCode?: string | null
  errorMessage?: string | null
}

export type AnalysisStatusSnapshot = {
  status: string
  startedAt?: string | null
  finishedAt?: string | null
}

export const PIPELINE_STAGE_LABELS: Record<PipelineStageKey, string> = {
  ingest: 'Import',
  probe: 'Metadaten',
  scene_detect: 'Szenen',
  frame_sample: 'Frames',
  audio: 'Audio',
  vision: 'Vision',
  aggregate: 'Zusammenführung',
  index: 'Index',
}

export const PIPELINE_STAGE_HINTS: Record<PipelineStageKey, string> = {
  ingest: 'Medien werden vorbereitet',
  probe: 'Dauer, Auflösung und Framerate',
  scene_detect: 'Schnittpunkte im Video',
  frame_sample: 'Stichproben pro Szene',
  audio: 'Tonspur und Transkript',
  vision: 'KI-Szenenanalyse über OpenRouter',
  aggregate: 'Ergebnisse werden zusammengeführt',
  index: 'Suche und Metadaten-Index',
}

const ANALYSIS_STATUS_LABELS: Record<string, string> = {
  queued: 'In Warteschlange',
  running: 'Läuft',
  succeeded: 'Abgeschlossen',
  failed: 'Fehlgeschlagen',
  cancelled: 'Abgebrochen',
  none: 'Keine Analyse',
}

const STAGE_STATUS_LABELS: Record<PipelineStageStatus, string> = {
  pending: 'Ausstehend',
  queued: 'Warteschlange',
  running: 'Läuft',
  succeeded: 'Fertig',
  failed: 'Fehler',
  cancelled: 'Abgebrochen',
}

const MEDIA_LIFECYCLE_LABELS: Record<string, string> = {
  uploading: 'Upload',
  uploaded: 'Hochgeladen',
  processing: 'Verarbeitung',
  ready: 'Bereit',
  failed: 'Fehler',
  archived: 'Archiviert',
}

export function pipelineStageLabel(stageKey: string): string {
  return PIPELINE_STAGE_LABELS[stageKey as PipelineStageKey] ?? stageKey
}

export function pipelineStageHint(stageKey: string): string {
  return PIPELINE_STAGE_HINTS[stageKey as PipelineStageKey] ?? ''
}

export function analysisStatusLabel(status: string | null | undefined): string {
  if (!status) return ANALYSIS_STATUS_LABELS.none
  return ANALYSIS_STATUS_LABELS[status] ?? status
}

export function stageStatusLabel(status: PipelineStageStatus): string {
  return STAGE_STATUS_LABELS[status] ?? status
}

export function mediaLifecycleLabel(state: string): string {
  return MEDIA_LIFECYCLE_LABELS[state] ?? state
}

export function mergeStagesWithPipeline(stages: readonly PipelineStageSnapshot[]): PipelineStageSnapshot[] {
  const byKey = new Map(stages.map((stage) => [stage.stageKey, stage]))
  return PIPELINE_STAGES.map((stageKey) => {
    const existing = byKey.get(stageKey)
    if (existing) return { ...existing, stageKey }
    return { stageKey, status: 'pending' }
  })
}

function stageProgressFraction(stage: PipelineStageSnapshot): number {
  if (stage.status === 'succeeded') return 1
  if (stage.status === 'failed' || stage.status === 'cancelled') return 0
  if (stage.status === 'pending' || stage.status === 'queued') return 0
  const total = stage.progressTotal ?? 0
  const done = stage.progressCompleted ?? 0
  if (total > 0) return Math.min(1, Math.max(0, done / total))
  return 0.35
}

export function computePipelineProgress(stages: readonly PipelineStageSnapshot[]): number {
  const merged = mergeStagesWithPipeline(stages)
  const sum = merged.reduce((acc, stage) => acc + stageProgressFraction(stage), 0)
  return Math.round((sum / PIPELINE_STAGES.length) * 100)
}

export function activePipelineStage(stages: readonly PipelineStageSnapshot[]): PipelineStageSnapshot | null {
  const merged = mergeStagesWithPipeline(stages)
  const running = merged.find((stage) => stage.status === 'running')
  if (running) return running
  const queued = merged.find((stage) => stage.status === 'queued')
  if (queued) return queued
  const failed = merged.find((stage) => stage.status === 'failed')
  if (failed) return failed
  const pending = merged.find((stage) => stage.status === 'pending')
  return pending ?? merged[merged.length - 1] ?? null
}

export function pipelineStatusHeadline(input: {
  analysis: AnalysisStatusSnapshot | null
  stages: readonly PipelineStageSnapshot[]
  mediaLifecycleState?: string
}): string {
  const active = activePipelineStage(input.stages)
  if (input.analysis?.status === 'running' && active) {
    const progress = computePipelineProgress(input.stages)
    const detail =
      active.progressTotal && active.progressTotal > 1
        ? ` · ${active.progressCompleted ?? 0}/${active.progressTotal}`
        : ''
    return `${pipelineStageLabel(active.stageKey)}${detail} · ${progress}%`
  }
  if (input.analysis?.status === 'queued') return 'Analyse startet gleich …'
  if (input.analysis?.status === 'failed' && active?.status === 'failed') {
    return `Fehler in ${pipelineStageLabel(active.stageKey)}`
  }
  if (input.analysis?.status === 'succeeded') return 'Analyse abgeschlossen'
  if (input.mediaLifecycleState === 'processing') return 'Medien werden verarbeitet'
  return analysisStatusLabel(input.analysis?.status)
}
