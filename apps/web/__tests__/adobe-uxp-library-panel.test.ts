// @ts-nocheck — panel helpers are plain JS outside apps/web; Vitest imports them directly.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '@/lib/paths'
import { normalizeCollections } from '../../../tools/adobe-uxp-library-panel/src/collections.js'
import {
  buildHitHref,
  dedupeSearchHits,
  formatRank,
  normalizeSearchHit,
  sceneHitDurationLabel,
  sceneHitTimingLabel,
} from '../../../tools/adobe-uxp-library-panel/src/hit-model.js'
import {
  assertLocalImportPath,
  isHttpUrl,
  pathBasename,
  pathsLikelyMatch,
} from '../../../tools/adobe-uxp-library-panel/src/premiere-path.js'
import { looksLikeApiToken, normalizeProductBaseUrl } from '../../../tools/adobe-uxp-library-panel/src/settings.js'
import {
  cacheStats,
  formatCacheBytes,
  parseCacheIndex,
  pickEvictionKeys,
} from '../../../tools/adobe-uxp-library-panel/src/cache-index.js'
import {
  aeLayerTiming,
  msToSeconds,
  planAeInserts,
  sceneSourceWindowSec,
} from '../../../tools/adobe-uxp-library-panel/src/ae-placement.js'
import { insertHitIntoAfterEffects } from '../../../tools/adobe-uxp-library-panel/src/aftereffects.js'
import { msToFrames, sceneInOutFrames } from '../../../tools/adobe-uxp-library-panel/src/time.js'

describe('adobe uxp library panel contracts', () => {
  it('exposes adobe-download path helper with kind/mode', () => {
    expect(
      paths.routes.apiMediaAdobeDownload('media-1', 'proj-1', { kind: 'source', mode: 'json' }),
    ).toBe(
      '/api/media/media-1/adobe-download?platformProjectId=proj-1&kind=source&mode=json',
    )
  })

  it('domain + api specs lock Wave 1 source download', () => {
    const domain = readFileSync(
      join(__dirname, '../../../specs/domain/adobe-uxp-library-panel.md'),
      'utf8',
    )
    const api = readFileSync(join(__dirname, '../../../specs/api/media-adobe-download.md'), 'utf8')
    expect(domain).toContain('adobe-uxp-library-panel')
    expect(domain).toContain('tools/adobe-uxp-library-panel/')
    expect(domain).toContain('1…40')
    expect(api).toContain('/api/media/:mediaAssetId/adobe-download')
    expect(api).toContain('proxy_unavailable')
    expect(api).toContain('mode=json')
  })

  it('adobe-download route enforces Model B + proxy_unavailable', () => {
    const source = readFileSync(
      join(__dirname, '../app/api/media/[mediaAssetId]/adobe-download/route.ts'),
      'utf8',
    )
    expect(source).toContain('requireSessionUserId')
    expect(source).toContain('resolveMediaInWorkspace')
    expect(source).toContain('proxy_unavailable')
    expect(source).toContain("disposition: 'attachment'")
    expect(source).toContain('cacheKey')
  })

  it('search route clamps limit 1…40 and forwards to db helpers', () => {
    const source = readFileSync(join(__dirname, '../app/api/media/search/route.ts'), 'utf8')
    expect(source).toContain('Math.min(Math.max(limitRaw, 1), 40)')
    expect(source).toContain('limit,')
    expect(source).toMatch(/searchMediaInWorkspace\(\{[\s\S]*limit/)
    expect(source).toMatch(/searchMediaForAccessibleProjects\(\{[\s\S]*limit/)
  })

  it('panel scaffold ships Premiere UXP manifest (host premierepro)', () => {
    const root = join(__dirname, '../../../tools/adobe-uxp-library-panel')
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
    expect(manifest.id).toBe('videon.libraryPanel')
    expect(manifest.host.app).toBe('premierepro')
    expect(manifest.host.minVersion).toBe('25.6.0')
    expect(manifest.entrypoints?.[0]?.type).toBe('panel')
    expect(manifest.version).toBe('0.1.11')
    expect(readFileSync(join(root, 'preview.html'), 'utf8')).toContain('importmap')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('collection-select')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('select-all-btn')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('panel-version')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('v0.1.11')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).not.toContain('onclick=')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('src/panel.bundle.js')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('src/styles.css')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).not.toContain('type="module"')
    expect(readFileSync(join(root, 'src/panel.bundle.js'), 'utf8')).toContain('require("uxp")')
    expect(readFileSync(join(root, 'src/panel.bundle.js'), 'utf8')).not.toMatch(/await import\("uxp"\)/)
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain('scheduleBoot')
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain("PANEL_VERSION = '0.1.11'")
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain('function on(el, eventName, handler)')
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).not.toMatch(/document\.addEventListener\s*\(/)
    expect(readFileSync(join(root, 'src/http.js'), 'utf8')).toContain('XMLHttpRequest')
    expect(readFileSync(join(root, 'src/api.js'), 'utf8')).toContain('httpRequest')
    expect(readFileSync(join(root, 'src/panel.bundle.js'), 'utf8')).toContain('scheduleBoot')
    expect(readFileSync(join(root, 'src/panel.bundle.js'), 'utf8')).toContain('0.1.11')
    expect(readFileSync(join(root, 'src/panel.bundle.js'), 'utf8')).toContain('XMLHttpRequest')
    expect(readFileSync(join(root, 'src/panel.bundle.js'), 'utf8')).not.toMatch(/document\.addEventListener\s*\(/)
  })

  it('premiere path helpers reject signed URLs for import', () => {
    expect(isHttpUrl('https://minio.example/x')).toBe(true)
    expect(isHttpUrl('/Users/me/cache/clip.mp4')).toBe(false)
    expect(() => assertLocalImportPath('https://cdn.example/a.mp4')).toThrow(/lokale Datei/i)
    expect(assertLocalImportPath('/tmp/a.mp4')).toBe('/tmp/a.mp4')
    expect(pathBasename('C:\\\\cache\\\\foo.mp4')).toBe('foo.mp4')
    expect(pathsLikelyMatch('/a/b/clip.mp4', 'C:/x/clip.mp4')).toBe(true)
  })

  it('converts scene ms to frames', () => {
    expect(msToFrames(1000, 25)).toBe(25)
    expect(sceneInOutFrames({ startMs: 500, endMs: 1500 }, 25)).toEqual({
      inPoint: 13,
      outPoint: 38,
    })
    expect(sceneInOutFrames({ startMs: null, endMs: 1000 }, 25)).toBeNull()
  })

  it('normalizes search hits and builds href when missing', () => {
    const hit = normalizeSearchHit({
      mediaAssetId: 'm1',
      platformProjectId: 'p1',
      mediaFilename: 'a.mp4',
      startMs: 1200,
      endMs: 3400,
      searchText: 'hello',
      rank: 0.42,
    })
    expect(hit.href).toBe('/media/m1?platformProjectId=p1&t=1200')
    expect(sceneHitTimingLabel(hit)).toBe('00:01–00:03')
    expect(sceneHitDurationLabel(hit)).toBe('00:02')
    expect(formatRank(hit.rank)).toBe('0.42')
    expect(buildHitHref({ ...hit, sceneKey: 'scene-2' })).toContain('scene=scene-2')
  })

  it('dedupes identical scene hits keeping higher rank', () => {
    const hits = dedupeSearchHits([
      normalizeSearchHit({
        id: '1',
        mediaAssetId: 'm1',
        platformProjectId: 'p1',
        sceneKey: 's1',
        startMs: 0,
        endMs: 1000,
        rank: 0.1,
      }),
      normalizeSearchHit({
        id: '2',
        mediaAssetId: 'm1',
        platformProjectId: 'p1',
        sceneKey: 's1',
        startMs: 0,
        endMs: 1000,
        rank: 0.9,
      }),
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0].rank).toBe(0.9)
  })

  it('validates product base url and token shape', () => {
    expect(normalizeProductBaseUrl('https://videon.example/').ok).toBe(true)
    expect(normalizeProductBaseUrl('https://videon.example/').value).toBe('https://videon.example')
    expect(normalizeProductBaseUrl('ftp://x').ok).toBe(false)
    expect(looksLikeApiToken('videon_' + 'a'.repeat(64))).toBe(true)
    expect(looksLikeApiToken('nope')).toBe(false)
  })

  it('normalizes collections payload shapes', () => {
    expect(normalizeCollections({ items: [{ id: 'a', name: 'Alpha' }, { id: '', name: 'x' }] })).toEqual([
      { id: 'a', name: 'Alpha', status: 'active' },
    ])
    expect(normalizeCollections([{ id: 'b', name: 'Beta', status: 'archived' }])).toEqual([
      { id: 'b', name: 'Beta', status: 'archived' },
    ])
  })

  it('premiere adapter documents importFiles + InOut + SequenceEditor', () => {
    const src = readFileSync(
      join(__dirname, '../../../tools/adobe-uxp-library-panel/src/premiere.js'),
      'utf8',
    )
    expect(src).toContain('importFiles')
    expect(src).toContain('createSetInOutPointsAction')
    expect(src).toContain('createInsertProjectItemAction')
    expect(src).toContain('ensureBin')
  })

  it('cache index supports stats + oldest-first eviction', () => {
    const index = parseCacheIndex({
      a: { fileName: 'a.mp4', at: 1, bytes: 100 },
      b: { fileName: 'b.mp4', at: 2, bytes: 200 },
      c: { fileName: 'c.mp4', at: 3, bytes: 50 },
    })
    expect(cacheStats(index)).toEqual({ count: 3, bytes: 350 })
    expect(formatCacheBytes(1536)).toContain('KB')
    expect(
      pickEvictionKeys(index, { maxBytes: 200, maxEntries: 80, incomingBytes: 80, keepKey: 'new' }),
    ).toEqual(['a', 'b'])
    // 3 existing + 1 incoming → need ≤2 entries → evict 2 oldest
    expect(pickEvictionKeys(index, { maxEntries: 2, maxBytes: 1e12, incomingBytes: 0 })).toEqual([
      'a',
      'b',
    ])
  })

  it('panel wires cache clear UI + resolveCachedPath', () => {
    const root = join(__dirname, '../../../tools/adobe-uxp-library-panel')
    expect(readFileSync(join(root, 'src/index.html'), 'utf8')).toContain('cache-clear')
    expect(readFileSync(join(root, 'src/cache.js'), 'utf8')).toContain('resolveCachedPath')
    expect(readFileSync(join(root, 'src/cache.js'), 'utf8')).toContain('readCachedPosterBlob')
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toContain('clearCache')
  })

  it('AE placement planner sequential + gap + corrected layer timing', () => {
    expect(msToSeconds(2500)).toBe(2.5)
    expect(sceneSourceWindowSec({ startMs: 1000, endMs: 3000 })).toEqual({
      inPointSec: 1,
      outPointSec: 3,
      durationSec: 2,
    })
    const timing = aeLayerTiming({ startMs: 1000, endMs: 3000 }, 5)
    expect(timing).toMatchObject({
      startTime: 4,
      inPoint: 5,
      outPoint: 7,
      durationSec: 2,
      fullFootage: false,
    })
    const plan = planAeInserts(
      [
        { id: 'a', startMs: 0, endMs: 2000 },
        { id: 'b', startMs: 500, endMs: 1500 },
      ],
      { sequential: true, gapFrames: 25, fps: 25, startAtSec: 0 },
    )
    expect(plan[0].compTimeSec).toBe(0)
    expect(plan[1].compTimeSec).toBe(3) // 2s clip + 1s gap
  })

  it('AE adapter returns explicit unsupported without host scripting', async () => {
    const result = await insertHitIntoAfterEffects({
      filePath: '/tmp/clip.mp4',
      compName: 'VIDEON',
      hit: { id: 'h1', startMs: 0, endMs: 1000, mediaFilename: 'clip.mp4' },
      allowPlan: false,
    })
    expect(result.ok).toBe(false)
    expect(result.mode).toBe('unsupported')
    expect(result.plan?.compTimeSec).toBe(0)

    const planOnly = await insertHitIntoAfterEffects({
      filePath: '/tmp/clip.mp4',
      compName: 'VIDEON',
      hit: { id: 'h1', startMs: 0, endMs: 1000 },
      allowPlan: true,
    })
    expect(planOnly.ok).toBe(true)
    expect(planOnly.mode).toBe('plan')
  })

  it('domain spec locks Wave 1.5 AE honesty (no fake insert)', () => {
    const domain = readFileSync(
      join(__dirname, '../../../specs/domain/adobe-uxp-library-panel.md'),
      'utf8',
    )
    expect(domain).toContain('Wave 1.5')
    expect(domain).toContain('MUST NOT pretend success')
    expect(domain).toContain('dual-host')
  })
})
