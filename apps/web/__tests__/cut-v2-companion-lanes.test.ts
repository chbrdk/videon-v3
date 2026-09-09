import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mapTranscriptToVideoOverlay } from '@/lib/cut-timeline'
import { effectiveStemMutes } from '@/lib/cut-lane-aware-audio'

describe('V2 companion lanes', () => {
  it('wires grouped lane order and V2 companions in the Cut timeline', () => {
    const timeline = readFileSync(join(__dirname, '../components/cut-timeline.tsx'), 'utf8')
    const header = readFileSync(join(__dirname, '../components/timeline-track-header.tsx'), 'utf8')
    const view = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const spec = readFileSync(join(__dirname, '../../../specs/domain/cut-multi-track.md'), 'utf8')

    expect(header).toMatch(/v2a1/)
    expect(header).toMatch(/v2tx/)
    expect(timeline).toMatch(/v2TranscriptSegments/)
    expect(timeline).toMatch(/V2 Source Audio A1 Voice/)
    expect(timeline).toMatch(/track--v2-tx/)
    expect(view).toMatch(/mapTranscriptToVideoOverlay/)
    expect(view).toMatch(/effectiveStemMutes/)
    expect(view).toMatch(/v2TranscriptSegments=/)
    expect(spec).toMatch(/V2-A1\/V2-A2\/V2-TX/)
    expect(spec).toMatch(/lane-aware/)

    const v1 = timeline.indexOf('aria-label="Video-Spur"')
    const a1 = timeline.indexOf('aria-label="Source Audio A1 Voice"')
    const a2 = timeline.indexOf('aria-label="Source Audio A2 Music"')
    const v2 = timeline.indexOf('aria-label="Video-Overlay V2"')
    const v2a1 = timeline.indexOf('aria-label="V2 Source Audio A1 Voice"')
    const bus = timeline.indexOf('videon-cut-timeline__track--bus')
    expect(v1).toBeGreaterThan(-1)
    expect(a1).toBeGreaterThan(v1)
    expect(a2).toBeGreaterThan(a1)
    expect(v2).toBeGreaterThan(a2)
    expect(v2a1).toBeGreaterThan(v2)
    expect(bus).toBeGreaterThan(v2a1)
  })

  it('maps overlay transcripts onto timeline_start_ms', () => {
    const mapped = mapTranscriptToVideoOverlay(
      [
        {
          id: 'c1',
          position: 0,
          mediaAssetId: 'm1',
          startMs: 1000,
          endMs: 4000,
          timelineStartMs: 5000,
        },
      ],
      {
        m1: [{ startMs: 1500, endMs: 2500, text: 'hello' }],
      },
    )
    expect(mapped).toHaveLength(1)
    expect(mapped[0]?.text).toBe('hello')
    expect(mapped[0]?.cutStartMs).toBe(5500)
    expect(mapped[0]?.cutEndMs).toBe(6500)
  })

  it('uses V2 mute keys when program lane is v2', () => {
    expect(
      effectiveStemMutes({
        programLane: 'v2',
        mutes: { a1: false, a2: false, v2a1: true, v2a2: false },
      }),
    ).toEqual({ a1: true, a2: false })
    expect(
      effectiveStemMutes({
        programLane: 'v1',
        mutes: { a1: true, a2: false, v2a1: false, v2a2: true },
      }),
    ).toEqual({ a1: true, a2: false })
  })
})
