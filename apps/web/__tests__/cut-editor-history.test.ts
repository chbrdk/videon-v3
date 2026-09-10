import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  pushCutEditorHistory,
  snapshotCutEditor,
  snapshotFromClips,
  timelineSnapshotKey,
} from '@/lib/cut-editor-history'
import { computeTrimPreview } from '@/lib/trim-modes'

describe('cut editor history', () => {
  it('stores timeline snapshots for undo', () => {
    const clips = [
      {
        scene: {
          id: 's1',
          position: 0,
          mediaAssetId: 'm1',
          startMs: 0,
          endMs: 1000,
        },
      },
    ]
    const snapshot = snapshotFromClips(clips, 250, 0)
    const pushed = pushCutEditorHistory([], -1, snapshot)
    expect(pushed.history).toHaveLength(1)
    expect(pushed.history[0]?.cutPlayheadMs).toBe(250)
    expect(pushed.history[0]?.videoClips).toEqual([])
    expect(pushed.history[0]?.audioClips).toEqual([])
  })

  it('includes V2 and VO in multilayer snapshots', () => {
    const snapshot = snapshotCutEditor({
      clips: [
        {
          scene: {
            id: 's1',
            position: 0,
            mediaAssetId: 'm1',
            startMs: 0,
            endMs: 1000,
            timelineStartMs: 0,
          },
        },
      ],
      videoClips: [
        {
          id: 'v1',
          trackId: 'tv',
          position: 0,
          mediaAssetId: 'm2',
          startMs: 0,
          endMs: 500,
          timelineStartMs: 200,
        },
      ],
      audioClips: [
        {
          id: 'a1',
          trackId: 'ta',
          position: 0,
          mediaAssetId: 'm3',
          startMs: 0,
          endMs: 800,
          timelineStartMs: 100,
        },
      ],
      cutPlayheadMs: 0,
      activeIndex: 0,
    })
    expect(snapshot.videoClips).toHaveLength(1)
    expect(snapshot.audioClips[0]?.timelineStartMs).toBe(100)
    const same = snapshotCutEditor({
      clips: snapshot.scenes.map((scene) => ({ scene })),
      videoClips: snapshot.videoClips,
      audioClips: snapshot.audioClips,
      cutPlayheadMs: 99,
      activeIndex: 1,
    })
    expect(timelineSnapshotKey(snapshot)).toBe(timelineSnapshotKey(same))
    const pushed = pushCutEditorHistory([snapshot], 0, same)
    expect(pushed.history).toHaveLength(1)
  })
})

describe('Slip trim mode', () => {
  it('keeps duration when slipping source window', () => {
    const preview = computeTrimPreview({
      mode: 'trim',
      edge: 'start',
      startMs: 1000,
      endMs: 3000,
      sourceDelta: 500,
      mediaDurationMs: 10000,
    })
    expect(preview).toEqual({ startMs: 1500, endMs: 3500 })
  })
})

describe('cut wave 4 contracts', () => {
  it('timeline honors Slip trimMode instead of forcing ripple', () => {
    const src = readFileSync(join(__dirname, '../components/cut-timeline.tsx'), 'utf8')
    expect(src).not.toContain("trimMode === 'roll' ? 'roll' : 'ripple'")
    expect(src).toContain('const mode = trimMode')
    expect(src).toContain("v2Mode === 'trim'")
  })

  it('restore API accepts multilayer clips + timelineStartMs', () => {
    const src = readFileSync(join(__dirname, '../app/api/cuts/[cutId]/route.ts'), 'utf8')
    expect(src).toContain('videoClips: videoParsed.clips')
    expect(src).toContain('audioClips: audioParsed.clips')
    expect(src).toContain('timelineStartMs')
    expect(src).toContain('MIN_CUT_CLIP_MS')
    expect(src).toContain('randomUUID()')
    expect(src).toContain('No valid scenes in restore payload')
  })

  it('restoreCutTimeline replaces video and audio lanes', () => {
    const src = readFileSync(join(__dirname, '../lib/db/cuts.ts'), 'utf8')
    expect(src).toContain('delete from cut_video_clips')
    expect(src).toContain('delete from cut_audio_clips')
  })

  it('domain wave4 spec locks Slip + multilayer undo', () => {
    const domain = readFileSync(
      join(__dirname, '../../../specs/domain/cut-timeline-edit-ux-wave4.md'),
      'utf8',
    )
    expect(domain).toContain('Slip')
    expect(domain).toContain('videoClips')
    expect(domain).toContain('MUST NOT coerce Slip')
  })
})
