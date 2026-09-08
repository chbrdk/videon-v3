import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('purgeMediaAssetForWorkspace SQL', () => {
  it('archives empty cuts with $1 workspace bind (not a missing $2)', () => {
    const source = readFileSync(join(process.cwd(), 'lib/db/media.ts'), 'utf8')
    const block = source.slice(source.indexOf('export async function purgeMediaAssetForWorkspace'))
    expect(block).toMatch(/where workspace_id = \$1/)
    expect(block).not.toMatch(/where workspace_id = \$2\s*\n\s*and not exists/)
  })
})
