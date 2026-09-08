import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { paths } from '../lib/paths'

describe('media frame route', () => {
  it('documents apiMediaFrame helper', () => {
    expect(paths.routes.apiMediaFrame('m1', 'p1', 12500)).toBe(
      '/api/media/m1/frame?platformProjectId=p1&t=12500',
    )
    expect(paths.routes.apiMediaFrame('m1', 'p1')).toBe(
      '/api/media/m1/frame?platformProjectId=p1',
    )
  })

  it('route uses Model B session resolver and frame extract', () => {
    const source = readFileSync(
      join(__dirname, '../app/api/media/[mediaAssetId]/frame/route.ts'),
      'utf8',
    )
    expect(source).toContain('requireSessionUserId')
    expect(source).toContain('resolveMediaInWorkspace')
    expect(source).toContain('extractFrameJpegBytes')
    expect(source).toContain('image/jpeg')
  })
})
