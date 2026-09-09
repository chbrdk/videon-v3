import { describe, expect, it } from 'vitest'
import { buildCutTimelineContextMenuDraft } from '@/lib/cut-timeline-context-menu'
import { cutEdgeSnapPoints, snapCutMs } from '@/lib/timeline-snap'

describe('buildCutTimelineContextMenuDraft', () => {
  it('lists clip actions with split/merge/delete gates', () => {
    const items = buildCutTimelineContextMenuDraft({
      kind: 'cut-clip',
      sceneId: 's1',
      index: 0,
      cutStartMs: 0,
      cutEndMs: 2000,
      canMerge: true,
      canDelete: true,
      canSplit: true,
    })
    expect(items.map((item) => item.id)).toEqual([
      'section-clip',
      'inspect-clip',
      'seek-clip-start',
      'split-at-playhead',
      'merge-next',
      'delete-clip',
    ])
    expect(items.find((item) => item.id === 'merge-next')?.disabled).toBe(false)
  })

  it('disables delete when only one clip remains', () => {
    const items = buildCutTimelineContextMenuDraft({
      kind: 'cut-clip',
      sceneId: 's1',
      index: 0,
      cutStartMs: 0,
      cutEndMs: 1000,
      canMerge: false,
      canDelete: false,
      canSplit: false,
    })
    expect(items.find((item) => item.id === 'delete-clip')?.disabled).toBe(true)
  })

  it('offers seek on empty lane', () => {
    const items = buildCutTimelineContextMenuDraft({ kind: 'cut-lane', atMs: 500 })
    expect(items.map((item) => item.id)).toEqual(['section-lane', 'seek-here'])
  })
})

describe('snapCutMs', () => {
  it('snaps to nearest edge within threshold', () => {
    const points = cutEdgeSnapPoints([
      { cutStartMs: 0, cutEndMs: 1000 },
      { cutStartMs: 1000, cutEndMs: 2500 },
    ], 1200)
    expect(snapCutMs(1010, points)).toBe(1000)
    expect(snapCutMs(1180, points)).toBe(1200)
    expect(snapCutMs(1500, points)).toBe(1500)
  })
})
