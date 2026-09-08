import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const API_ROOT = join(__dirname, '../app/api')

function listRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) listRouteFiles(full, acc)
    else if (name === 'route.ts') acc.push(full)
  }
  return acc
}

describe('V7 E2 API surface inventory', () => {
  it('exposes no Docker / shell / ops control routes', () => {
    const routes = listRouteFiles(API_ROOT).map((file) => file.slice(API_ROOT.length + 1))
    expect(routes.length).toBeGreaterThan(10)

    const forbidden = [/docker/i, /shell/i, /ops/i, /exec/i, /container/i, /admin\/system/i]
    for (const route of routes) {
      for (const pattern of forbidden) {
        expect(route, `forbidden pattern ${pattern} in ${route}`).not.toMatch(pattern)
      }
    }

    const joined = routes.join('\n')
    expect(joined).toContain('health/route.ts')
    expect(joined).toContain('media/')
    expect(joined).not.toMatch(/docker/i)
  })
})

describe('V7 E4 media archive SQL', () => {
  it('defines soft-archive and hard purge separately', () => {
    const source = readFileSync(join(process.cwd(), 'lib/db/media.ts'), 'utf8')
    expect(source).toMatch(/export async function archiveMediaAssetForWorkspace/)
    expect(source).toMatch(/export async function purgeMediaAssetForWorkspace/)
    expect(source).toMatch(/lifecycle_state = 'archived'/)

    const archiveBlock = source.slice(
      source.indexOf('export async function archiveMediaAssetForWorkspace'),
      source.indexOf('export async function purgeMediaAssetForWorkspace'),
    )
    expect(archiveBlock).not.toMatch(/delete from media_assets/)
    expect(archiveBlock).toMatch(/lifecycle_state = 'archived'/)

    const purgeBlock = source.slice(source.indexOf('export async function purgeMediaAssetForWorkspace'))
    expect(purgeBlock).toMatch(/delete from media_assets/)
    expect(purgeBlock).toMatch(/where workspace_id = \$1/)
  })

  it('DELETE route soft-archives without removing object storage', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/media/[mediaAssetId]/route.ts'),
      'utf8',
    )
    expect(source).toMatch(/archiveMediaAssetForWorkspace/)
    expect(source).not.toMatch(/removeObject/)
    expect(source).toMatch(/archived:\s*true/)
  })
})
