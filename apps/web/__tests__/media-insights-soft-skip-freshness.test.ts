import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishWorkspaceMediaInsights } from '../lib/media-insights-publish'

vi.mock('@/lib/db/client', () => ({
  databasePool: () => ({
    query: async () => ({ rows: [] }),
  }),
}))

vi.mock('@/lib/db/media', () => ({
  listMediaForWorkspace: async () => [{ id: 'm1' }],
}))

vi.mock('@/lib/db/search', () => ({
  listRecentSearchEntriesForWorkspace: async () => [
    {
      searchText: 'scene highlight one',
      sceneKey: 's1',
      mediaAssetId: 'm1',
      mediaFilename: 'clip.mp4',
      startMs: 0,
    },
  ],
}))

vi.mock('@/lib/db/workspaces', () => ({
  findWorkspaceById: async (id: string) =>
    id === 'ws-1'
      ? { id: 'ws-1', platformProjectId: '11111111-1111-4111-8111-111111111111' }
      : null,
}))

vi.mock('@/lib/runtime-config', () => ({
  isPlexonAuthConfigured: () => true,
  plexonAuthUrl: () => 'https://plexon.test',
  plexonBaseUrl: () => 'https://plexon.test',
  plexonServiceSecret: () => 'secret',
}))

describe('media-insights soft-skip freshness', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks media_insights publish_failed when pack GET soft-skips', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/knowledge') && (!init?.method || init.method === 'GET')) {
        return new Response('down', { status: 503 })
      }
      if (url.includes('/freshness') && init?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response('unexpected', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await publishWorkspaceMediaInsights({
      workspaceId: 'ws-1',
      soft: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.skipped).toBe(true)
      expect(result.error).toBe('pack_unavailable')
    }

    const freshnessCalls = fetchMock.mock.calls.filter(([url, init]) =>
      String(url).includes('/facets/media_insights/freshness') &&
      (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(freshnessCalls.length).toBe(1)
    const body = JSON.parse(String((freshnessCalls[0][1] as RequestInit).body))
    expect(body.freshness).toBe('publish_failed')
    expect(body.note).toContain('pack_unavailable')
  })
})
