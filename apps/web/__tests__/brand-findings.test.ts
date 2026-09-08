import { describe, expect, it } from 'vitest'
import {
  aggregateBrandCheckStatuses,
  buildBrandCandidatePathMap,
  selectBrandEvidenceRefs,
  toBrandCheckView,
} from '@/lib/brand-findings'

describe('buildBrandCandidatePathMap', () => {
  it('maps OCR/logo hints onto matching content or asset tokens', () => {
    const pathMap = buildBrandCandidatePathMap(
      [
        { text: 'Porsche', kind: 'logo_or_wordmark' },
        { text: 'UnknownBrand', kind: 'other' },
      ],
      [
        { path: 'content.brand.name', type: 'content', value: 'Porsche AG' },
        { path: 'logo.primary', type: 'asset', value: 'porsche-mark' },
      ],
    )
    expect(pathMap.Porsche).toBe('content.brand.name')
    expect(pathMap['text:Porsche']).toBe('content.brand.name')
    expect(pathMap.UnknownBrand).toBeUndefined()
  })
})

describe('selectBrandEvidenceRefs', () => {
  it('prefers brand-candidate frames when capping', () => {
    const selected = selectBrandEvidenceRefs({
      frameRefs: [
        { id: 'f0', timestampMs: 0 },
        { id: 'f1', timestampMs: 1000 },
        { id: 'f2', timestampMs: 2000 },
        { id: 'f3', timestampMs: 3000 },
      ],
      brandCandidates: [{ evidenceFrameIds: ['f2', 'f3'] }],
      startMs: 0,
      endMs: 4000,
      maxFrames: 2,
    })
    expect(selected.map((frame) => frame.id)).toEqual(['f2', 'f3'])
  })

  it('synthesizes a midpoint when no frame refs exist', () => {
    const selected = selectBrandEvidenceRefs({
      frameRefs: [],
      brandCandidates: [],
      startMs: 100,
      endMs: 300,
    })
    expect(selected).toEqual([{ id: 'scene-mid', timestampMs: 200 }])
  })
})

describe('aggregateBrandCheckStatuses', () => {
  it('keeps worst-case severity and never upgrades pending to pass', () => {
    expect(aggregateBrandCheckStatuses(['pass', 'fail', 'warn'])).toBe('fail')
    expect(aggregateBrandCheckStatuses(['pass', 'queued_pending_brandion'])).toBe(
      'queued_pending_brandion',
    )
    expect(aggregateBrandCheckStatuses(['pass', 'warn'])).toBe('warn')
    expect(aggregateBrandCheckStatuses(['pass', 'pass'])).toBe('pass')
  })
})

describe('toBrandCheckView', () => {
  it('surfaces Brandion rule findings for the inspector', () => {
    const view = toBrandCheckView({
      sceneKey: 'scene-0',
      status: 'fail',
      brandionRequestId: 'run-1',
      provenance: {
        guidelineId: 'gl-demo',
        evidenceFrameCount: 2,
        evidenceTimestampsMs: [120, 840],
        frameStatuses: ['fail', 'pass'],
      },
      result: {
        passed: 1,
        failed: 1,
        skipped: 0,
        results: [
          {
            ruleId: 'r1',
            name: 'Primary logo present',
            passed: false,
            severity: 'error',
            message: 'Logo missing',
          },
          {
            ruleId: 'r2',
            name: 'Brand color',
            passed: true,
            severity: 'info',
            message: 'ok',
          },
        ],
      },
    })
    expect(view.guidelineId).toBe('gl-demo')
    expect(view.reason).toBeNull()
    expect(view.hint).toBeNull()
    expect(view.evidenceFrameCount).toBe(2)
    expect(view.evidenceTimestampsMs).toEqual([120, 840])
    expect(view.frameStatuses).toEqual(['fail', 'pass'])
    expect(view.findings).toHaveLength(2)
    expect(view.findings[0]?.name).toBe('Primary logo present')
  })

  it('exposes skipped guideline reason and hint', () => {
    const view = toBrandCheckView({
      sceneKey: 'scene-0',
      status: 'skipped',
      brandionRequestId: null,
      provenance: {
        reason: 'no_active_guideline',
        hint: 'In Brandion ein Active-Pack für diese Collection setzen.',
      },
      result: {},
    })
    expect(view.guidelineId).toBeNull()
    expect(view.reason).toBe('no_active_guideline')
    expect(view.hint).toContain('Active-Pack')
    expect(view.findings).toEqual([])
    expect(view.observations).toEqual([])
  })

  it('merges Brandion tokenCoverage into inspector findings', () => {
    const view = toBrandCheckView({
      sceneKey: 'scene-0',
      status: 'pass',
      brandionRequestId: 'run-2',
      provenance: { guidelineId: 'gl-demo', evidenceFrameCount: 1 },
      result: {
        passed: 0,
        failed: 0,
        skipped: 0,
        results: [],
        tokenCoverage: {
          total: 2,
          matched: 1,
          partial: 0,
          notFound: 1,
          skipped: 0,
          score: 0.5,
          items: [
            {
              tokenPath: 'color.brand.primary',
              tokenType: 'color',
              channel: 'digital',
              status: 'matched',
              confidence: 1,
              detectedValue: '#FFCC00',
              expectedValue: '#FFCC00',
            },
            {
              tokenPath: 'color.brand.accent',
              tokenType: 'color',
              channel: 'digital',
              status: 'not_found',
              confidence: 0,
              detectedValue: '#111111',
              expectedValue: '#0000FF',
            },
            {
              tokenPath: 'color.brand.unused',
              tokenType: 'color',
              channel: 'digital',
              status: 'not_found',
              confidence: 0,
            },
          ],
        },
        observations: [{ tokenPath: 'color.brand.primary', observedValue: '#FFCC00', field: 'hex' }],
      },
    })
    expect(view.findings).toHaveLength(2)
    expect(view.findings[0]?.message).toContain('stimmt')
    expect(view.findings[1]?.passed).toBe(false)
    expect(view.passed).toBe(1)
    expect(view.failed).toBe(1)
    expect(view.status).toBe('fail')
    expect(view.observations).toHaveLength(1)
  })
})
