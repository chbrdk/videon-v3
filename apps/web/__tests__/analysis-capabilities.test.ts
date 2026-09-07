import { describe, expect, it } from 'vitest'
import {
  AGGREGATE_CAPABILITY,
  ANALYSIS_USER_BUNDLES,
  DEFAULT_REQUESTED_CAPABILITIES,
  EmptyAnalysisCapabilitiesError,
  PROBE_CAPABILITY,
  SCENE_DETECT_CAPABILITY,
  STEM_DEMUCS_CAPABILITY,
  TRANSCRIPT_CAPABILITY,
  VISION_CAPABILITY,
  normalizeRequestedCapabilities,
  selectedBundlesFromCapabilities,
} from '@/lib/pipeline/constants'
import { resolveCapabilitiesFromAnalysisBody } from '@/lib/pipeline/analysis-request'
import { computePipelineProgress, stageStatusLabel } from '@/lib/pipeline/pipeline-status'

describe('normalizeRequestedCapabilities', () => {
  it('expands vision bundle and always includes probe', () => {
    expect(normalizeRequestedCapabilities(['vision'])).toEqual([
      PROBE_CAPABILITY,
      SCENE_DETECT_CAPABILITY,
      VISION_CAPABILITY,
    ])
  })

  it('accepts raw capability ids without re-adding deselected work', () => {
    expect(normalizeRequestedCapabilities([TRANSCRIPT_CAPABILITY, STEM_DEMUCS_CAPABILITY])).toEqual([
      PROBE_CAPABILITY,
      TRANSCRIPT_CAPABILITY,
      STEM_DEMUCS_CAPABILITY,
    ])
    expect(normalizeRequestedCapabilities([TRANSCRIPT_CAPABILITY])).not.toContain(VISION_CAPABILITY)
    expect(normalizeRequestedCapabilities([TRANSCRIPT_CAPABILITY])).not.toContain(STEM_DEMUCS_CAPABILITY)
  })

  it('keeps demucs only when stems are selected', () => {
    const withStems = normalizeRequestedCapabilities(['stems', 'aggregate'])
    expect(withStems).toContain(STEM_DEMUCS_CAPABILITY)
    expect(withStems).not.toContain(VISION_CAPABILITY)

    const withoutStems = normalizeRequestedCapabilities(['transcript', 'aggregate'])
    expect(withoutStems).not.toContain(STEM_DEMUCS_CAPABILITY)
  })

  it('rejects empty user selection', () => {
    expect(() => normalizeRequestedCapabilities([])).toThrow(EmptyAnalysisCapabilitiesError)
    expect(() => normalizeRequestedCapabilities([PROBE_CAPABILITY])).toThrow(EmptyAnalysisCapabilitiesError)
  })

  it('upload defaults include transcript but not demucs', () => {
    expect([...DEFAULT_REQUESTED_CAPABILITIES]).toEqual([
      PROBE_CAPABILITY,
      SCENE_DETECT_CAPABILITY,
      VISION_CAPABILITY,
      TRANSCRIPT_CAPABILITY,
      AGGREGATE_CAPABILITY,
    ])
    expect(DEFAULT_REQUESTED_CAPABILITIES).not.toContain(STEM_DEMUCS_CAPABILITY)
  })
})

describe('resolveCapabilitiesFromAnalysisBody', () => {
  it('stores exact subset from capabilities body', () => {
    expect(
      resolveCapabilitiesFromAnalysisBody({
        capabilities: [VISION_CAPABILITY, TRANSCRIPT_CAPABILITY],
      }),
    ).toEqual([PROBE_CAPABILITY, SCENE_DETECT_CAPABILITY, VISION_CAPABILITY, TRANSCRIPT_CAPABILITY])
  })

  it('maps legacy stemMethod demucs onto upload defaults plus demucs', () => {
    const caps = resolveCapabilitiesFromAnalysisBody({ stemMethod: 'demucs' })
    expect(caps).toContain(STEM_DEMUCS_CAPABILITY)
    expect(caps).toContain(VISION_CAPABILITY)
    expect(caps).toContain(TRANSCRIPT_CAPABILITY)
  })
})

describe('analysis user bundles', () => {
  it('exposes four dialog options with labels', () => {
    expect(ANALYSIS_USER_BUNDLES).toHaveLength(4)
    expect(ANALYSIS_USER_BUNDLES.map((bundle) => bundle.id)).toEqual([
      'vision',
      'transcript',
      'stems',
      'aggregate',
    ])
    expect(ANALYSIS_USER_BUNDLES.every((bundle) => bundle.label.length > 0)).toBe(true)
  })

  it('maps stored capabilities back to selected bundles', () => {
    const caps = normalizeRequestedCapabilities(['vision', 'stems', 'aggregate'])
    expect(selectedBundlesFromCapabilities(caps).sort()).toEqual(['aggregate', 'stems', 'vision'])
  })

  it('disables submit when no user bundle is selected', () => {
    expect(() => normalizeRequestedCapabilities([])).toThrow(EmptyAnalysisCapabilitiesError)
  })
})

describe('skipped pipeline stages', () => {
  it('labels skipped and counts them toward progress', () => {
    expect(stageStatusLabel('skipped')).toBe('Übersprungen')
    const progress = computePipelineProgress([
      { stageKey: 'ingest', status: 'succeeded' },
      { stageKey: 'probe', status: 'succeeded' },
      { stageKey: 'scene_detect', status: 'skipped' },
      { stageKey: 'frame_sample', status: 'skipped' },
      { stageKey: 'audio', status: 'succeeded' },
      { stageKey: 'vision', status: 'skipped' },
      { stageKey: 'brand_compliance', status: 'skipped' },
      { stageKey: 'aggregate', status: 'skipped' },
      { stageKey: 'index', status: 'skipped' },
    ])
    expect(progress).toBe(100)
  })
})
