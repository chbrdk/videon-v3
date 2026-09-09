import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CUT_EDITOR_SHORTCUTS, cutShortcutCatalogHasKey } from '@/lib/cut-editor-shortcuts'
import {
  lockedClipIdsStorageKey,
  pruneLockedClipIds,
  readLockedClipIds,
  writeLockedClipIds,
} from '@/lib/cut-clip-locks'
import { minimapPointerToScrollLeft } from '@/lib/timeline-minimap-pan'
import { beginLaneMarquee } from '@/lib/timeline-marquee'

describe('cut editor shortcuts catalog', () => {
  it('includes Wave 1+2 keys', () => {
    expect(cutShortcutCatalogHasKey('N')).toBe(true)
    expect(cutShortcutCatalogHasKey('R')).toBe(true)
    expect(cutShortcutCatalogHasKey('Shift+L')).toBe(true)
    expect(cutShortcutCatalogHasKey(';')).toBe(true)
    expect(CUT_EDITOR_SHORTCUTS.length).toBeGreaterThan(10)
  })
})

describe('clip lock localStorage', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('roundtrips and prunes stale ids', () => {
    expect(lockedClipIdsStorageKey('cut-1')).toBe('videon.cut.lockedClipIds.cut-1')
    writeLockedClipIds('cut-1', ['a', 'b', 'gone'])
    expect(readLockedClipIds('cut-1')).toEqual(['a', 'b', 'gone'])
    expect(pruneLockedClipIds(['a', 'b', 'gone'], ['a', 'b'])).toEqual(['a', 'b'])
    expect(pruneLockedClipIds(['a'], [])).toEqual(['a'])
  })
})

describe('minimap pan math', () => {
  it('centers viewport on pointer', () => {
    expect(
      minimapPointerToScrollLeft({
        clientX: 50,
        trackLeft: 0,
        trackWidth: 100,
        contentWidthPx: 1000,
        viewportWidthPx: 200,
      }),
    ).toBe(400)
  })
})

describe('wave3 smoke', () => {
  it('wires shortcuts catalog, V2/VO marquee, minimap drag, lock persist', () => {
    const editor = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const timeline = readFileSync(join(__dirname, '../components/cut-timeline.tsx'), 'utf8')
    const minimap = readFileSync(join(__dirname, '../components/cut-timeline-minimap.tsx'), 'utf8')
    const paths = readFileSync(join(__dirname, '../../../knowledge/paths.md'), 'utf8')
    const spec = readFileSync(join(__dirname, '../../../specs/domain/cut-editor-shortcuts.md'), 'utf8')

    expect(editor).toMatch(/CUT_EDITOR_SHORTCUTS/)
    expect(editor).toMatch(/writeLockedClipIds/)
    expect(editor).toMatch(/readLockedClipIds/)
    expect(timeline).toMatch(/beginLaneMarquee/)
    expect(timeline).toMatch(/lane: 'v2'/)
    expect(timeline).toMatch(/lane: 'audio'/)
    expect(minimap).toMatch(/onWindowPointerDown|minimapPointerToScrollLeft/)
    expect(paths).toMatch(/videon\.cut\.lockedClipIds/)
    expect(spec).toMatch(/CUT_EDITOR_SHORTCUTS/)
    expect(typeof beginLaneMarquee).toBe('function')
  })
})
