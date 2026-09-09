import { describe, expect, it } from 'vitest'
import { detectScenes, scenesFromCutPointsMs } from '@/lib/pipeline/scene-detect'
import { analysisInputFingerprint, PIPELINE_VERSION } from '@/lib/pipeline/constants'
import { parseSceneInsight, toSceneInsightView } from '@/lib/vision-schema'

describe('detectScenes', () => {
  it('splits long videos into bounded windows', () => {
    expect(detectScenes(65_000)).toHaveLength(3)
    expect(detectScenes(65_000)[0]).toEqual({ key: 'scene-0', startMs: 0, endMs: 30_000 })
  })

  it('creates at least one scene for short clips', () => {
    expect(detectScenes(4_000)).toEqual([{ key: 'scene-0', startMs: 0, endMs: 4_000 }])
  })
})

describe('scenesFromCutPointsMs', () => {
  it('keeps abutting montage cuts separate (does not merge on zero gap)', () => {
    // ~30 shots in 60s at ~2s each
    const cuts = Array.from({ length: 29 }, (_, i) => (i + 1) * 2_000)
    const scenes = scenesFromCutPointsMs(cuts, 60_000)
    expect(scenes).toHaveLength(30)
    expect(scenes[0]).toEqual({ key: 'scene-0', startMs: 0, endMs: 2_000 })
    expect(scenes[29]).toEqual({ key: 'scene-29', startMs: 58_000, endMs: 60_000 })
  })

  it('absorbs micro-scenes under MIN_SCENE_MS into the previous shot', () => {
    const scenes = scenesFromCutPointsMs([2_000, 2_200, 4_000], 6_000)
    expect(scenes.map((s) => [s.startMs, s.endMs])).toEqual([
      [0, 2_200],
      [2_200, 4_000],
      [4_000, 6_000],
    ])
  })
})

describe('analysisInputFingerprint', () => {
  it('binds pipeline and schema versions to the media checksum', () => {
    const digest = 'a'.repeat(64)
    expect(analysisInputFingerprint(digest)).toBe(`${PIPELINE_VERSION}:videon.scene-insight.v2:${digest}`)
  })
})

describe('parseSceneInsight', () => {
  it('drops invented evidence frame ids instead of rejecting the scene', () => {
    const parsed = parseSceneInsight(
      {
        schemaVersion: 'videon.scene-insight.v2',
        summary: 'Gelber Porsche 911 fährt an einer Person vorbei.',
        objects: [
          {
            id: 'obj_1',
            label: 'Porsche 911',
            category: 'vehicle',
            attributes: ['yellow'],
            count: 1,
            evidenceFrameIds: ['frame-1', 'made-up'],
          },
        ],
        people: [
          {
            id: 'p1',
            count: 1,
            apparentAgeRange: 'middle_adult',
            apparentPresentation: ['casual'],
            role: 'bystander',
            evidenceFrameIds: ['bogus'],
          },
        ],
        setting: {
          location: 'urban_street',
          timeOfDay: 'day',
          environment: ['outdoor'],
          details: [],
        },
        composition: {
          shotType: 'medium_wide',
          cameraMotion: 'static_or_slow_pan',
          dominantColors: ['yellow'],
        },
        actions: [
          {
            label: 'vehicle_passing',
            startMs: 0,
            endMs: 2400,
            actorIds: ['obj_1'],
            evidenceFrameIds: ['bogus'],
          },
        ],
        brandCandidates: [
          {
            text: 'Porsche',
            kind: 'logo_or_wordmark',
            objectId: 'obj_1',
            evidenceFrameIds: ['scene-0-f0'],
            confidence: 'likely',
          },
        ],
        mood: ['dynamic'],
        notableDetails: [{ text: 'close-up', evidenceFrameIds: ['scene-0-f0'] }],
        safetyFlags: [],
        observedVsInferred: 'observed_primary',
      },
      ['scene-0-f0', 'scene-0-f1', 'frame-1'],
    )

    expect(parsed?.objects[0]?.evidenceFrameIds).toEqual(['frame-1'])
    expect(parsed?.people[0]?.evidenceFrameIds).toEqual([])
    expect(parsed?.actions[0]?.evidenceFrameIds).toEqual([])
    expect(parsed?.brandCandidates[0]?.evidenceFrameIds).toEqual(['scene-0-f0'])
    expect(parsed?.notableDetails[0]?.evidenceFrameIds).toEqual(['scene-0-f0'])
  })

  it('rejects v1 payloads for the v2 parser', () => {
    expect(
      parseSceneInsight({
        schemaVersion: 'videon.scene-insight.v1',
        summary: 'legacy',
        subjects: [],
        actions: [],
        setting: { location: 'x', timeOfDay: 'y', details: [] },
        mood: [],
        notableDetails: [],
        safetyFlags: [],
      }),
    ).toBeNull()
  })
})

describe('toSceneInsightView', () => {
  it('maps legacy v1 subjects into objects for UI', () => {
    const view = toSceneInsightView({
      schemaVersion: 'videon.scene-insight.v1',
      summary: 'Person spricht.',
      subjects: [{ label: 'person', attributes: ['standing'], evidenceFrameIds: ['f0'] }],
      actions: [{ label: 'speaking', startMs: 0, endMs: 1000, evidenceFrameIds: ['f0'] }],
      setting: { location: 'studio', timeOfDay: 'day', details: [] },
      mood: ['calm'],
      notableDetails: [],
      safetyFlags: [],
    })
    expect(view?.objects[0]?.label).toBe('person')
    expect(view?.people).toEqual([])
    expect(view?.actions[0]?.actorIds).toEqual([])
  })
})
