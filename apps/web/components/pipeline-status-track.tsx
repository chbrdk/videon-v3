'use client'

import {
  Badge,
  Meter,
  MeterList,
  StepStrip,
  StepStripItem,
  Text,
  type StatusLevel,
} from '@msqdx/ui'
import {
  analysisStatusLabel,
  computePipelineProgress,
  mediaLifecycleLabel,
  mergeStagesWithPipeline,
  pipelineStageHint,
  pipelineStageLabel,
  pipelineStatusHeadline,
  stageStatusLabel,
  type AnalysisStatusSnapshot,
  type PipelineStageSnapshot,
} from '@/lib/pipeline/pipeline-status'
import { statusLevelToBadgeTone } from '@/lib/status-badge-tone'

type PipelineStatusTrackProps = {
  analysis: AnalysisStatusSnapshot | null
  stages: readonly PipelineStageSnapshot[]
  mediaLifecycleState?: string
  variant?: 'detailed' | 'compact'
  showLifecycle?: boolean
  /** Drawer / inspect: stack stages vertically (default horizontal for wide lists). */
  stepOrientation?: 'horizontal' | 'vertical'
}

function statusLevel(status: string): StatusLevel {
  if (status === 'failed') return 'critical'
  if (status === 'running' || status === 'processing' || status === 'queued' || status === 'uploaded') {
    return 'warn'
  }
  return 'ok'
}

export function PipelineStatusTrack({
  analysis,
  stages,
  mediaLifecycleState,
  variant = 'detailed',
  showLifecycle = false,
  stepOrientation = 'horizontal',
}: PipelineStatusTrackProps) {
  const merged = mergeStagesWithPipeline(stages)
  const overallProgress = computePipelineProgress(stages)
  const headline = pipelineStatusHeadline({ analysis, stages, mediaLifecycleState })
  const activeIndex = merged.findIndex((stage) => stage.status === 'running')

  if (variant === 'compact') {
    return (
      <div className="videon-pipeline videon-pipeline--compact">
        <div className="videon-pipeline__summary">
          <Badge tone={statusLevelToBadgeTone(statusLevel(analysis?.status ?? 'none'))}>
            {analysisStatusLabel(analysis?.status)}
          </Badge>
          {showLifecycle && mediaLifecycleState ? (
            <Badge tone="neutral">{mediaLifecycleLabel(mediaLifecycleState)}</Badge>
          ) : null}
          <Text role="meta" as="span">
            {headline}
          </Text>
        </div>
        <MeterList aria-label="Pipeline-Fortschritt">
          <Meter label="Gesamt" value={overallProgress} valueLabel={`${overallProgress}%`} disabled />
        </MeterList>
      </div>
    )
  }

  return (
    <div className="videon-pipeline videon-pipeline--detailed">
      <div className="videon-pipeline__summary">
        <div className="videon-pipeline__summary-row">
          <Badge tone={statusLevelToBadgeTone(statusLevel(analysis?.status ?? 'none'))}>
            {analysisStatusLabel(analysis?.status)}
          </Badge>
          {showLifecycle && mediaLifecycleState ? (
            <Badge tone="neutral">Medien: {mediaLifecycleLabel(mediaLifecycleState)}</Badge>
          ) : null}
        </div>
        <Text role="body" as="p">
          {headline}
        </Text>
        <MeterList aria-label="Pipeline-Fortschritt">
          <Meter label="Gesamt" value={overallProgress} valueLabel={`${overallProgress}%`} disabled />
        </MeterList>
      </div>

      <StepStrip
        aria-label="Pipeline-Stufen"
        orientation={stepOrientation}
        scrollToIndex={activeIndex >= 0 ? activeIndex : null}
        hint={pipelineStageHint(merged[activeIndex]?.stageKey ?? merged[0]?.stageKey ?? 'probe')}
      >
        {merged.map((stage, index) => (
          <StepStripItem
            key={stage.stageKey}
            index={index}
            label={pipelineStageLabel(stage.stageKey)}
            active={stage.status === 'running'}
            selected={stage.status === 'succeeded' || stage.status === 'skipped'}
          >
            <Text role="label" as="span">
              {pipelineStageLabel(stage.stageKey)}
            </Text>
            <Text role="meta" as="span">
              {stageStatusLabel(stage.status)}
              {stage.progressTotal != null && stage.progressTotal > 1
                ? ` · ${stage.progressCompleted ?? 0}/${stage.progressTotal}`
                : ''}
            </Text>
            {stage.status === 'failed' && stage.errorMessage ? (
              <Text role="body" as="span">
                {stage.errorMessage}
              </Text>
            ) : null}
          </StepStripItem>
        ))}
      </StepStrip>
    </div>
  )
}
