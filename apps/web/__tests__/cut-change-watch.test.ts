import { describe, expect, it } from 'vitest'
import {
  findStaleLinkedCuts,
  formatStaleCutsBanner,
  isCutStaleVsLink,
  parseIsoMs,
} from '../../../tools/adobe-uxp-library-panel/src/cut-change-watch.js'

describe('cut-change-watch Wave P5', () => {
  it('parses ISO timestamps', () => {
    expect(parseIsoMs('2026-09-10T12:00:00.000Z')).toBe(Date.parse('2026-09-10T12:00:00.000Z'))
    expect(parseIsoMs('nope')).toBeNull()
  })

  it('detects stale cuts vs synced stamp', () => {
    expect(
      isCutStaleVsLink('2026-09-10T12:01:00.000Z', '2026-09-10T12:00:00.000Z', null),
    ).toBe(true)
    expect(
      isCutStaleVsLink('2026-09-10T12:00:00.000Z', '2026-09-10T12:00:00.000Z', null),
    ).toBe(false)
    expect(isCutStaleVsLink('2026-09-10T12:01:00.000Z', null, '2026-09-10T12:00:00.000Z')).toBe(
      true,
    )
    expect(isCutStaleVsLink('2026-09-10T12:01:00.000Z', null, null)).toBe(false)
  })

  it('lists only linked stale cuts', () => {
    const cuts = [
      { id: 'a', name: 'Alpha', updatedAt: '2026-09-10T12:05:00.000Z' },
      { id: 'b', name: 'Beta', updatedAt: '2026-09-10T12:05:00.000Z' },
      { id: 'c', name: 'Gamma', updatedAt: '2026-09-10T11:00:00.000Z' },
    ]
    const links = {
      a: { syncedUpdatedAt: '2026-09-10T12:00:00.000Z' },
      c: { syncedUpdatedAt: '2026-09-10T12:00:00.000Z' },
    }
    const stale = findStaleLinkedCuts(cuts, (id) => links[id] || null)
    expect(stale.map((row) => row.cut.id)).toEqual(['a'])
    expect(formatStaleCutsBanner(stale)).toMatch(/Alpha/)
    expect(formatStaleCutsBanner(stale)).toMatch(/Cut neu laden/)
    expect(formatStaleCutsBanner(stale, { autoPatch: true })).toMatch(/Auto-Patch/)
  })
})
