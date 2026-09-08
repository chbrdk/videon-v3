import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { paths } from '../lib/paths'

describe('media preview route', () => {
  it('documents apiMediaPreview helper', () => {
    expect(paths.routes.apiMediaPreview('m1', 'p1', { tMs: 12500, durationMs: 2000 })).toBe(
      '/api/media/m1/preview?platformProjectId=p1&t=12500&durationMs=2000',
    )
    expect(paths.routes.apiMediaPreview('m1', 'p1')).toBe(
      '/api/media/m1/preview?platformProjectId=p1',
    )
  })

  it('route uses Model B session resolver and preview extract', () => {
    const source = readFileSync(
      join(__dirname, '../app/api/media/[mediaAssetId]/preview/route.ts'),
      'utf8',
    )
    expect(source).toContain('requireSessionUserId')
    expect(source).toContain('resolveMediaInWorkspace')
    expect(source).toContain('extractPreviewMp4Bytes')
    expect(source).toContain('video/mp4')
    expect(source).toContain('Cache-Control')
  })

  it('frame-sample exports extractPreviewMp4Bytes with clamp bounds', () => {
    const source = readFileSync(join(__dirname, '../lib/pipeline/frame-sample.ts'), 'utf8')
    expect(source).toContain('extractPreviewMp4Bytes')
    expect(source).toContain('PREVIEW_DURATION_MAX_MS = 3000')
    expect(source).toContain('libx264')
  })
})
