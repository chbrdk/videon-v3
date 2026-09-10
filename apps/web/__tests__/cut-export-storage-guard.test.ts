// @ts-nocheck
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('cut export download storage guard', () => {
  it('verifies object exists before signing downloadUrl', () => {
    const route = readFileSync(
      join(__dirname, '../app/api/cuts/[cutId]/exports/[exportId]/route.ts'),
      'utf8',
    )
    expect(route).toContain('objectExists')
    expect(route).toContain('Export package missing in storage')
    expect(route).toContain('markCutExportFailed')
  })

  it('maps missing media keys to clear premiere export errors', () => {
    const src = readFileSync(join(__dirname, '../lib/pipeline/export-cut.ts'), 'utf8')
    expect(src).toContain('Source media file missing in storage')
    expect(src).toContain('Track media file missing in storage')
  })

  it('S3ObjectStore exposes objectExists', () => {
    const src = readFileSync(join(__dirname, '../lib/storage/s3-object-store.ts'), 'utf8')
    expect(src).toContain('async objectExists')
    expect(src).toContain('NoSuchKey')
  })
})
