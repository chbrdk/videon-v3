import { describe, expect, it } from 'vitest'
import { pushCutEditorHistory, snapshotFromClips } from '@/lib/cut-editor-history'

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
  })
})
