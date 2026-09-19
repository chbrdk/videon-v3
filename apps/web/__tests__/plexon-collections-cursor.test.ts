import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()

vi.mock('../lib/runtime-config', () => ({
  federationMode: () => 'live',
  isLiveFederationConfigured: () => true,
  plexonBaseUrl: () => 'http://plexon.test',
  plexonServiceSecret: () => 'secret',
}))

vi.mock('../lib/paths', () => ({
  paths: { plexonAccessibleCollectionsPath: '/api/platform/provisioning/accessible-collections' },
}))

describe('fetchAccessibleCollections cursor paging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('pages through nextCursor until exhausted', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { id: 'c1', name: 'One', companyId: 'co-1', status: 'active', domain: null },
            { id: 'c2', name: 'Two', companyId: 'co-1', status: 'active', domain: null },
          ],
          nextCursor: 'page-2',
          truncated: true,
          totalAccessible: 3,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ id: 'c3', name: 'Three', companyId: 'co-1', status: 'active', domain: null }],
          nextCursor: null,
          truncated: false,
          totalAccessible: 3,
        }),
      })

    const { fetchAccessibleCollections } = await import('../lib/plexon-collections')
    const result = await fetchAccessibleCollections('user-1')
    expect(result?.items.map((i) => i.id)).toEqual(['c1', 'c2', 'c3'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
