import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_SERVICE_SECRET_HEADER,
  PLEXON_USER_HEADER,
} from '@videon-v3/contracts'

const COLLECTION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const fetchMock = vi.fn()

const federation = { mode: 'live' as 'live' | 'dummy', configured: true }

vi.mock('@/lib/runtime-config', () => ({
  federationMode: () => federation.mode,
  isLiveFederationConfigured: () => federation.configured,
  plexonBaseUrl: () => 'http://plexon.test',
  plexonServiceSecret: () => 'secret',
}))

import {
  createCollectionInviteOnPlexon,
  fetchCollectionMembersFromPlexon,
  revokeCollectionMemberOnPlexon,
} from '@/lib/collection-members-plexon'

describe('collection members federation client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    federation.mode = 'live'
    federation.configured = true
    vi.stubGlobal('fetch', fetchMock)
  })

  it('calls the provisioning members path with contract headers', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { userId: 'u1', email: 'owner@example.com', name: 'Owner', role: 'admin', source: 'creator' },
          { userId: '', email: 'broken@example.com' },
        ],
      }),
    })

    const result = await fetchCollectionMembersFromPlexon({
      platformProjectId: COLLECTION_ID,
      plexonUserId: 'viewer-1',
    })

    expect(result).toEqual({
      ok: true,
      items: [
        { userId: 'u1', email: 'owner@example.com', name: 'Owner', role: 'admin', source: 'creator' },
      ],
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `http://plexon.test/api/platform/provisioning/collections/${COLLECTION_ID}/members`,
    )
    const headers = init.headers as Record<string, string>
    expect(headers[PLEXON_CONTRACT_VERSION_HEADER]).toBe(PLEXON_FEDERATION_CONTRACT_VERSION)
    expect(headers[PLEXON_SERVICE_SECRET_HEADER]).toBe('secret')
    expect(headers[PLEXON_USER_HEADER]).toBe('viewer-1')
  })

  it('stays inert when federation is not live', async () => {
    federation.mode = 'dummy'
    const result = await fetchCollectionMembersFromPlexon({
      platformProjectId: COLLECTION_ID,
      plexonUserId: 'viewer-1',
    })
    expect(result).toEqual({ ok: false, status: 503, error: 'federation_off' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never calls federation for a non-Collection id', async () => {
    const result = await revokeCollectionMemberOnPlexon({
      platformProjectId: 'plx-local-demo',
      plexonUserId: 'viewer-1',
      memberUserId: 'u2',
    })
    expect(result).toEqual({ ok: false, status: 503, error: 'federation_off' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces upstream errors instead of inventing success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'not_collection_admin' }),
    })
    const result = await createCollectionInviteOnPlexon({
      platformProjectId: COLLECTION_ID,
      plexonUserId: 'viewer-1',
    })
    expect(result).toEqual({ ok: false, status: 403, error: 'not_collection_admin' })
  })

  it('maps a transport failure to 502', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'))
    const result = await fetchCollectionMembersFromPlexon({
      platformProjectId: COLLECTION_ID,
      plexonUserId: 'viewer-1',
    })
    expect(result).toEqual({ ok: false, status: 502, error: 'socket hang up' })
  })
})
