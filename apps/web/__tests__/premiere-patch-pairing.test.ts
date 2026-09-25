import { describe, expect, it } from 'vitest'
import { encodeClipDisplayName } from '../../../tools/adobe-uxp-library-panel/src/clip-identity.js'
import {
  matchScenesToClips,
  mediaAssetIdFromAnyText,
  pairScenesToTrackItemNames,
  scoreSceneAgainstClip,
  selectLinkedAudioClips,
} from '../../../tools/adobe-uxp-library-panel/src/clip-match.js'
import { tickTimeToMs, sanitizeSceneTiming, planClipPatch } from '../../../tools/adobe-uxp-library-panel/src/premiere-patch-cut.js'

describe('clip-match Wave P4.2', () => {
  const a = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const b = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'
  const m1 = '11111111-1111-1111-1111-111111111111'
  const m2 = '22222222-2222-2222-2222-222222222222'

  it('pairs by scene id marks in clip names', () => {
    const scenes = [{ id: a }, { id: b }]
    const names = [encodeClipDisplayName('fin 1.mp4', a), encodeClipDisplayName('fin 2.mp4', b)]
    const paired = pairScenesToTrackItemNames(scenes, names)
    expect(paired.mode).toBe('by_scene_id')
    expect(paired.pairs.map((p) => p.itemIndex)).toEqual([0, 1])
  })

  it('falls back to order when marks missing but counts match', () => {
    const scenes = [{ id: a }, { id: b }]
    const paired = pairScenesToTrackItemNames(scenes, ['fin 1.mp4', 'fin 2.mp4'])
    expect(paired.mode).toBe('by_order')
    expect(paired.pairs.map((p) => p.itemIndex)).toEqual([0, 1])
  })

  it('rejects when counts drift and marks missing', () => {
    const paired = pairScenesToTrackItemNames([{ id: a }, { id: b }], ['only-one.mp4'])
    expect(paired.mode).toBe('none')
    expect(paired.message).toMatch(/nicht eindeutig|Clip/i)
  })

  it('matches by mediaAssetId when names differ', () => {
    const scenes = [
      { id: a, mediaAssetId: m1, originalFilename: 'a.mp4', timelineStartMs: 0, startMs: 0, endMs: 1000 },
      { id: b, mediaAssetId: m2, originalFilename: 'b.mp4', timelineStartMs: 1000, startMs: 0, endMs: 1000 },
    ]
    const clips = [
      {
        index: 0,
        name: 'renamed-in-premiere.mp4',
        mediaPath: `/Users/me/cache/media/${m2}/source`,
        timelineStartMs: 1000,
        inMs: 0,
        outMs: 1000,
      },
      {
        index: 1,
        name: 'other.mp4',
        mediaPath: `/Users/me/cache/media/${m1}/source`,
        timelineStartMs: 0,
        inMs: 0,
        outMs: 1000,
      },
    ]
    const paired = matchScenesToClips(scenes, clips)
    expect(paired.ok).toBe(true)
    expect(paired.pairs.find((p) => p.scene.id === a)?.itemIndex).toBe(1)
    expect(paired.pairs.find((p) => p.scene.id === b)?.itemIndex).toBe(0)
  })

  it('matches by filename + timeline when media ids missing', () => {
    const scenes = [
      {
        id: a,
        originalFilename: 'fin 1.mp4',
        timelineStartMs: 0,
        startMs: 500,
        endMs: 1500,
      },
      {
        id: b,
        originalFilename: 'fin 1.mp4',
        timelineStartMs: 5000,
        startMs: 2000,
        endMs: 3000,
      },
    ]
    const clips = [
      { index: 0, name: 'fin 1.mp4', filename: 'fin 1.mp4', timelineStartMs: 5000, inMs: 2000, outMs: 3000 },
      { index: 1, name: 'fin 1.mp4', filename: 'fin 1.mp4', timelineStartMs: 0, inMs: 500, outMs: 1500 },
    ]
    const paired = matchScenesToClips(scenes, clips)
    expect(paired.ok).toBe(true)
    expect(paired.pairs.find((p) => p.scene.id === a)?.itemIndex).toBe(1)
    expect(paired.pairs.find((p) => p.scene.id === b)?.itemIndex).toBe(0)
  })

  it('allows extra Premiere clips when all scenes match', () => {
    const scenes = [{ id: a, mediaAssetId: m1, originalFilename: 'a.mp4', timelineStartMs: 0, startMs: 0, endMs: 500 }]
    const clips = [
      { index: 0, name: encodeClipDisplayName('a.mp4', a), mediaAssetId: m1, timelineStartMs: 0, inMs: 0, outMs: 500 },
      { index: 1, name: 'orphan.mp4', timelineStartMs: 9000, inMs: 0, outMs: 100 },
    ]
    const paired = matchScenesToClips(scenes, clips)
    expect(paired.ok).toBe(true)
    expect(paired.extraClips).toBe(1)
    expect(paired.pairs[0].itemIndex).toBe(0)
  })

  it('selects stereo audio pair linked to a video scene', () => {
    const scene = {
      id: a,
      mediaAssetId: m1,
      originalFilename: 'fin 1.mp4',
      timelineStartMs: 2000,
      startMs: 100,
      endMs: 1100,
    }
    const video = { timelineStartMs: 2000, mediaAssetId: m1, filenameKey: 'fin 1.mp4' }
    const audio = [
      {
        index: 0,
        name: 'fin 1.mp4',
        filenameKey: 'fin 1.mp4',
        mediaAssetId: m1,
        timelineStartMs: 2000,
        inMs: 100,
        outMs: 1100,
      },
      {
        index: 1,
        name: 'fin 1.mp4',
        filenameKey: 'fin 1.mp4',
        mediaAssetId: m1,
        timelineStartMs: 2000,
        inMs: 100,
        outMs: 1100,
      },
      {
        index: 2,
        name: 'other.mp4',
        filenameKey: 'other.mp4',
        mediaAssetId: m2,
        timelineStartMs: 8000,
        inMs: 0,
        outMs: 500,
      },
    ]
    const linked = selectLinkedAudioClips(scene, video, audio, new Set())
    expect(linked.sort()).toEqual([0, 1])
  })

  it('extracts media id from open-cut cache paths', () => {
    expect(mediaAssetIdFromAnyText(`/tmp/open-cut/media/${m1}/source`)).toBe(m1)
    expect(mediaAssetIdFromAnyText(`file-${m2}`)).toBe(m2)
  })

  it('scores scene_id highest', () => {
    const scored = scoreSceneAgainstClip(
      { id: a, mediaAssetId: m1, originalFilename: 'x.mp4' },
      { name: encodeClipDisplayName('x.mp4', a), mediaAssetId: m2 },
      0,
    )
    expect(scored.score).toBeGreaterThanOrEqual(1000)
    expect(scored.reasons).toContain('scene_id')
  })

  it('plans move for pure timeline slides', () => {
    const timing = sanitizeSceneTiming({
      startMs: 100,
      endMs: 1100,
      timelineStartMs: 5000,
    })
    const plan = planClipPatch(timing, {
      timelineStartMs: 2000,
      timelineEndMs: 3000,
      inMs: 100,
      outMs: 1100,
    })
    expect(plan.mode).toBe('move')
    expect(plan.deltaMs).toBe(3000)
  })

  it('plans noop when already aligned', () => {
    const timing = sanitizeSceneTiming({ startMs: 0, endMs: 1000, timelineStartMs: 2000 })
    const plan = planClipPatch(timing, {
      timelineStartMs: 2000,
      timelineEndMs: 3000,
      inMs: 0,
      outMs: 1000,
    })
    expect(plan.mode).toBe('noop')
  })

  it('sanitizes inverted scene windows', () => {
    const timing = sanitizeSceneTiming({ startMs: 900, endMs: 100, timelineStartMs: -5 })
    expect(timing.startMs).toBe(900)
    expect(timing.endMs).toBe(1400)
    expect(timing.timelineStartMs).toBe(0)
  })
})

