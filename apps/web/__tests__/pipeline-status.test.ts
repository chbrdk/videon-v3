import { describe, expect, it } from 'vitest'
import {
  activePipelineStage,
  computePipelineProgress,
  mergeStagesWithPipeline,
  pipelineStatusHeadline,
} from '@/lib/pipeline/pipeline-status'

describe('pipeline status helpers', () => {
  it('fills missing stages as pending', () => {
    const merged = mergeStagesWithPipeline([
      { stageKey: 'ingest', status: 'succeeded' },
      { stageKey: 'probe', status: 'running', progressCompleted: 0, progressTotal: 1 },
    ])
    expect(merged).toHaveLength(8)
    expect(merged[0]?.status).toBe('succeeded')
    expect(merged[1]?.status).toBe('running')
    expect(merged[2]?.status).toBe('pending')
  })

  it('computes weighted progress including vision sub-progress', () => {
    const progress = computePipelineProgress([
      { stageKey: 'ingest', status: 'succeeded' },
      { stageKey: 'probe', status: 'succeeded' },
      { stageKey: 'scene_detect', status: 'succeeded' },
      { stageKey: 'frame_sample', status: 'succeeded' },
      { stageKey: 'audio', status: 'succeeded' },
      { stageKey: 'vision', status: 'running', progressCompleted: 2, progressTotal: 4 },
    ])
    expect(progress).toBeGreaterThan(60)
    expect(progress).toBeLessThan(80)
  })

  it('reports the active stage in the headline', () => {
    const headline = pipelineStatusHeadline({
      analysis: { status: 'running' },
      stages: [
        { stageKey: 'ingest', status: 'succeeded' },
        { stageKey: 'vision', status: 'running', progressCompleted: 1, progressTotal: 3 },
      ],
    })
    expect(headline).toContain('Vision')
    expect(headline).toContain('1/3')
  })

  it('returns the running stage as active', () => {
    const active = activePipelineStage([
      { stageKey: 'ingest', status: 'succeeded' },
      { stageKey: 'vision', status: 'running', progressCompleted: 1, progressTotal: 2 },
    ])
    expect(active?.stageKey).toBe('vision')
  })
})
