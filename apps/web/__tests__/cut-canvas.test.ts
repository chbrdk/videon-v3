import { describe, expect, it } from 'vitest'
import { resolveCutCanvas, isCutExportFormat } from '@/lib/cut-canvas'

describe('resolveCutCanvas', () => {
  it('maps locked presets', () => {
    expect(resolveCutCanvas({ aspectPreset: '9:16' })).toEqual({
      ok: true,
      width: 1080,
      height: 1920,
      aspectPreset: '9:16',
    })
    expect(resolveCutCanvas({ aspectPreset: '16:9' })).toEqual({
      ok: true,
      width: 1920,
      height: 1080,
      aspectPreset: '16:9',
    })
    expect(resolveCutCanvas({ aspectPreset: '1:1' })).toEqual({
      ok: true,
      width: 1080,
      height: 1080,
      aspectPreset: '1:1',
    })
  })

  it('accepts even custom dimensions', () => {
    expect(resolveCutCanvas({ aspectPreset: 'custom', width: 1280, height: 720 })).toEqual({
      ok: true,
      width: 1280,
      height: 720,
      aspectPreset: 'custom',
    })
  })

  it('rejects odd or out-of-range custom', () => {
    expect(resolveCutCanvas({ aspectPreset: 'custom', width: 1081, height: 1920 }).ok).toBe(false)
    expect(resolveCutCanvas({ aspectPreset: 'custom', width: 0, height: 1080 }).ok).toBe(false)
    expect(resolveCutCanvas({ aspectPreset: 'custom', width: 4000, height: 2160 }).ok).toBe(false)
  })

  it('rejects unknown presets', () => {
    expect(resolveCutCanvas({ aspectPreset: '4:3' }).ok).toBe(false)
  })
})

describe('isCutExportFormat', () => {
  it('accepts mp4 and premiere_xml only', () => {
    expect(isCutExportFormat('mp4')).toBe(true)
    expect(isCutExportFormat('premiere_xml')).toBe(true)
    expect(isCutExportFormat('fcpxml')).toBe(false)
  })
})
