import { describe, expect, it } from 'vitest'
import { detectScenes } from '@/lib/pipeline/scene-detect'
import { analysisInputFingerprint, PIPELINE_VERSION } from '@/lib/pipeline/constants'
import { parseSceneInsight } from '@/lib/vision-schema'

describe('detectScenes', () => {
  it('splits long videos into bounded windows', () => {
    expect(detectScenes(65_000)).toHaveLength(3)
    expect(detectScenes(65_000)[0]).toEqual({ key: 'scene-0', startMs: 0, endMs: 30_000 })
  })

  it('creates at least one scene for short clips', () => {
    expect(detectScenes(4_000)).toEqual([{ key: 'scene-0', startMs: 0, endMs: 4_000 }])
  })
})

describe('analysisInputFingerprint', () => {
  it('binds pipeline and schema versions to the media checksum', () => {
    const digest = 'a'.repeat(64)
    expect(analysisInputFingerprint(digest)).toBe(`${PIPELINE_VERSION}:videon.scene-insight.v1:${digest}`)
  })
})

describe('parseSceneInsight', () => {
  it('drops invented evidence frame ids instead of rejecting the scene', () => {
    const parsed = parseSceneInsight(
      {
        schemaVersion: 'videon.scene-insight.v1',
        summary: 'Person spricht in die Kamera.',
        subjects: [{ label: 'person', attributes: [], evidenceFrameIds: ['frame-1', 'made-up'] }],
        actions: [{ label: 'speaking', startMs: 0, endMs: 2000, evidenceFrameIds: ['bogus'] }],
        setting: { location: 'studio', timeOfDay: 'day', details: [] },
        mood: ['calm'],
        notableDetails: [{ text: 'close-up', evidenceFrameIds: ['scene-0-f0'] }],
        safetyFlags: [],
      },
      ['scene-0-f0', 'scene-0-f1'],
    )

    expect(parsed?.subjects[0]?.evidenceFrameIds).toEqual([])
    expect(parsed?.actions[0]?.evidenceFrameIds).toEqual([])
    expect(parsed?.notableDetails[0]?.evidenceFrameIds).toEqual(['scene-0-f0'])
  })
})
