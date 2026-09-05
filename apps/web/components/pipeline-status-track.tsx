'use client'

import { Text } from '@msqdx/ui'
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

type PipelineStatusTrackProps = {
  analysis: AnalysisStatusSnapshot | null
  stages: readonly PipelineStageSnapshot[]
  mediaLifecycleState?: string
  variant?: 'detailed' | 'compact'
  showLifecycle?: boolean
}

function statusTone(status: string): string {
  if (status === 'succeeded' || status === 'ready') return 'is-done'
  if (status === 'running' || status === 'processing') return 'is-active'
  if (status === 'failed') return 'is-failed'
  if (status === 'queued' || status === 'uploaded') return 'is-waiting'
  if (status === 'cancelled' || status === 'archived') return 'is-muted'
  return 'is-pending'
}

function stageProgressPercent(stage: PipelineStageSnapshot): number | null {
  const total = stage.progressTotal ?? 0
  const done = stage.progressCompleted ?? 0
  if (total <= 1) return null
  return Math.round(Math.min(100, Math.max(0, (done / total) * 100)))
}

export function PipelineStatusTrack({
  analysis,
  stages,
  mediaLifecycleState,
  variant = 'detailed',
  showLifecycle = false,
}: PipelineStatusTrackProps) {
  const merged = mergeStagesWithPipeline(stages)
  const overallProgress = computePipelineProgress(stages)
  const headline = pipelineStatusHeadline({ analysis, stages, mediaLifecycleState })

  if (variant === 'compact') {
    return (
      <div className="videon-pipeline videon-pipeline--compact">
        <div className="videon-pipeline__summary">
          <span className={`videon-pipeline__badge ${statusTone(analysis?.status ?? 'none')}`}>
            {analysisStatusLabel(analysis?.status)}
          </span>
          {showLifecycle && mediaLifecycleState ? (
            <span className={`videon-pipeline__badge ${statusTone(mediaLifecycleState)}`}>
              {mediaLifecycleLabel(mediaLifecycleState)}
            </span>
          ) : null}
          <Text role="meta" as="span" className="videon-pipeline__headline">
            {headline}
          </Text>
        </div>
        <div className="videon-pipeline__overall" aria-hidden>
          <div className="videon-pipeline__overall-bar" style={{ width: `${overallProgress}%` }} />
        </div>
        <ol className="videon-pipeline__dots" aria-label="Pipeline-Fortschritt">
          {merged.map((stage) => (
            <li
              key={stage.stageKey}
              className={`videon-pipeline__dot ${statusTone(stage.status)}`}
              title={`${pipelineStageLabel(stage.stageKey)}: ${stageStatusLabel(stage.status)}`}
            />
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div className="videon-pipeline videon-pipeline--detailed">
      <div className="videon-pipeline__summary">
        <div className="videon-pipeline__summary-row">
          <span className={`videon-pipeline__badge ${statusTone(analysis?.status ?? 'none')}`}>
            {analysisStatusLabel(analysis?.status)}
          </span>
          {showLifecycle && mediaLifecycleState ? (
            <span className={`videon-pipeline__badge ${statusTone(mediaLifecycleState)}`}>
              Medien: {mediaLifecycleLabel(mediaLifecycleState)}
            </span>
          ) : null}
          <Text role="meta" as="span" className="videon-pipeline__percent">
            {overallProgress}%
          </Text>
        </div>
        <Text role="body" as="p" className="videon-pipeline__headline">
          {headline}
        </Text>
        <div className="videon-pipeline__overall" aria-hidden>
          <div className="videon-pipeline__overall-bar" style={{ width: `${overallProgress}%` }} />
        </div>
      </div>

      <ol className="videon-pipeline__steps">
        {merged.map((stage, index) => {
          const stepProgress = stageProgressPercent(stage)
          return (
            <li
              key={stage.stageKey}
              className={`videon-pipeline__step ${statusTone(stage.status)}`}
            >
              <div className="videon-pipeline__step-marker" aria-hidden>
                <span>{index + 1}</span>
              </div>
              <div className="videon-pipeline__step-body">
                <div className="videon-pipeline__step-row">
                  <Text role="title" as="span" className="videon-pipeline__step-label">
                    {pipelineStageLabel(stage.stageKey)}
                  </Text>
                  <span className={`videon-pipeline__step-status ${statusTone(stage.status)}`}>
                    {stageStatusLabel(stage.status)}
                    {stepProgress !== null ? ` · ${stage.progressCompleted ?? 0}/${stage.progressTotal}` : ''}
                  </span>
                </div>
                <Text role="meta" as="span" className="videon-pipeline__step-hint">
                  {pipelineStageHint(stage.stageKey)}
                </Text>
                {stepProgress !== null && stage.status === 'running' ? (
                  <div className="videon-pipeline__step-progress" aria-hidden>
                    <div className="videon-pipeline__step-progress-bar" style={{ width: `${stepProgress}%` }} />
                  </div>
                ) : null}
                {stage.status === 'failed' && stage.errorMessage ? (
                  <Text role="body" as="p" className="videon-pipeline__step-error">
                    {stage.errorMessage}
                  </Text>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
