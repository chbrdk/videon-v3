import { beforeEach, describe, expect, it, vi } from 'vitest'

const COLLECTION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

vi.mock('@/lib/session-user', () => ({
  requireSessionUserId: vi.fn(async () => 'viewer-1'),
}))

vi.mock('@/lib/plexon-collections', () => ({
  fetchAccessibleCollections: vi.fn(async () => ({
    items: [
      { id: COLLECTION_ID, name: 'Demo', status: 'active', companyId: 'co-1', domain: null },
    ],
    totalAccessible: 1,
    truncated: false,
  })),
}))

vi.mock('@/lib/collection-members-plexon', () => ({
  fetchCollectionMembersFromPlexon: vi.fn(),
  addCollectionMemberOnPlexon: vi.fn(),
  revokeCollectionMemberOnPlexon: vi.fn(),
  createCollectionInviteOnPlexon: vi.fn(),
}))

import {
  addCollectionMemberOnPlexon,
  createCollectionInviteOnPlexon,
  fetchCollectionMembersFromPlexon,
  revokeCollectionMemberOnPlexon,
} from '@/lib/collection-members-plexon'
import { fetchAccessibleCollections } from '@/lib/plexon-collections'
import { requireSessionUserId } from '@/lib/session-user'

function membersParams() {
  return { params: Promise.resolve({ platformProjectId: COLLECTION_ID }) }
}

describe('Collection team BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireSessionUserId).mockResolvedValue('viewer-1')
    vi.mocked(fetchAccessibleCollections).mockResolvedValue({
      items: [
        { id: COLLECTION_ID, name: 'Demo', status: 'active', companyId: 'co-1', domain: null },
      ],
      totalAccessible: 1,
      truncated: false,
    })
  })

  it('GET returns the PLEXON roster keyed by platformProjectId', async () => {
    vi.mocked(fetchCollectionMembersFromPlexon).mockResolvedValue({
      ok: true,
      items: [
        {
          userId: 'u1',
          email: 'owner@example.com',
          name: 'Owner',
          role: 'admin',
          source: 'creator',
        },
        {
          userId: 'u2',
          email: 'member@example.com',
          name: null,
          role: 'member',
          source: 'assignment',
        },
      ],
    })

    const { GET } = await import('@/app/api/collections/[platformProjectId]/members/route')
    const response = await GET(
      new Request(`http://localhost/api/collections/${COLLECTION_ID}/members`),
      membersParams(),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      source: string
      items: Array<{ id: string; email: string; status: string }>
    }
    expect(body.source).toBe('plexon')
    expect(body.items.map((item) => item.status)).toEqual(['owner', 'active'])
    expect(vi.mocked(fetchCollectionMembersFromPlexon).mock.calls[0]?.[0]).toMatchObject({
      platformProjectId: COLLECTION_ID,
      plexonUserId: 'viewer-1',
    })
  })

  it('GET without a session is unauthorized', async () => {
    vi.mocked(requireSessionUserId).mockResolvedValue(null)
    const { GET } = await import('@/app/api/collections/[platformProjectId]/members/route')
    const response = await GET(
      new Request(`http://localhost/api/collections/${COLLECTION_ID}/members`),
      membersParams(),
    )
    expect(response.status).toBe(401)
    expect(fetchCollectionMembersFromPlexon).not.toHaveBeenCalled()
  })

  it('GET fails closed when the Collection is not in the accessible directory', async () => {
    vi.mocked(fetchAccessibleCollections).mockResolvedValue({
      items: [],
      totalAccessible: 0,
      truncated: false,
    })
    const { GET } = await import('@/app/api/collections/[platformProjectId]/members/route')
    const response = await GET(
      new Request(`http://localhost/api/collections/${COLLECTION_ID}/members`),
      membersParams(),
    )
    expect(response.status).toBe(403)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('collection_access_denied')
    expect(fetchCollectionMembersFromPlexon).not.toHaveBeenCalled()
  })

  it('GET rejects a non-Collection id before calling federation', async () => {
    const { GET } = await import('@/app/api/collections/[platformProjectId]/members/route')
    const response = await GET(
      new Request('http://localhost/api/collections/plx-local-demo/members'),
      { params: Promise.resolve({ platformProjectId: 'plx-local-demo' }) },
    )
    expect(response.status).toBe(400)
    expect(fetchAccessibleCollections).not.toHaveBeenCalled()
    expect(fetchCollectionMembersFromPlexon).not.toHaveBeenCalled()
  })

  it('GET maps an unreachable directory to a retryable 503', async () => {
    vi.mocked(fetchAccessibleCollections).mockResolvedValue(null)
    const { GET } = await import('@/app/api/collections/[platformProjectId]/members/route')
    const response = await GET(
      new Request(`http://localhost/api/collections/${COLLECTION_ID}/members`),
      membersParams(),
    )
    expect(response.status).toBe(503)
    const body = (await response.json()) as { error: { code: string; retryable: boolean } }
    expect(body.error.code).toBe('dependency_unavailable')
    expect(body.error.retryable).toBe(true)
  })

  it('POST forwards the email to PLEXON', async () => {
    vi.mocked(addCollectionMemberOnPlexon).mockResolvedValue({
      ok: true,
      status: 'added',
      userId: 'u3',
      email: 'new@example.com',
      role: 'member',
    })
    const { POST } = await import('@/app/api/collections/[platformProjectId]/members/route')
    const response = await POST(
      new Request(`http://localhost/api/collections/${COLLECTION_ID}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ' new@example.com ', role: 'member' }),
      }),
      membersParams(),
    )
    expect(response.status).toBe(200)
    expect(vi.mocked(addCollectionMemberOnPlexon).mock.calls[0]?.[0]).toMatchObject({
      platformProjectId: COLLECTION_ID,
      email: 'new@example.com',
      role: 'member',
    })
  })

  it('POST without an email is invalid', async () => {
    const { POST } = await import('@/app/api/collections/[platformProjectId]/members/route')
    const response = await POST(
      new Request(`http://localhost/api/collections/${COLLECTION_ID}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'member' }),
      }),
      membersParams(),
    )
    expect(response.status).toBe(400)
    expect(addCollectionMemberOnPlexon).not.toHaveBeenCalled()
  })

  it('POST surfaces an upstream rejection as invalid_payload', async () => {
    vi.mocked(addCollectionMemberOnPlexon).mockResolvedValue({
      ok: false,
      status: 409,
      error: 'wrong_company',
    })
    const { POST } = await import('@/app/api/collections/[platformProjectId]/members/route')
    const response = await POST(
      new Request(`http://localhost/api/collections/${COLLECTION_ID}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nope@example.com' }),
      }),
      membersParams(),
    )
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('invalid_payload')
    expect(body.error.message).toBe('wrong_company')
  })

  it('DELETE revokes the assignment on PLEXON', async () => {
    vi.mocked(revokeCollectionMemberOnPlexon).mockResolvedValue({ ok: true })
    const { DELETE } = await import(
      '@/app/api/collections/[platformProjectId]/members/[userId]/route'
    )
    const response = await DELETE(
      new Request(`http://localhost/api/collections/${COLLECTION_ID}/members/u2`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ platformProjectId: COLLECTION_ID, userId: 'u2' }) },
    )
    expect(response.status).toBe(200)
    expect(vi.mocked(revokeCollectionMemberOnPlexon).mock.calls[0]?.[0]).toMatchObject({
      platformProjectId: COLLECTION_ID,
      memberUserId: 'u2',
    })
  })

  it('POST invites returns the PLEXON invite url', async () => {
    vi.mocked(createCollectionInviteOnPlexon).mockResolvedValue({
      ok: true,
      inviteUrl: 'https://plexon.test/invite/tok',
      inviteId: 'inv-1',
    })
    const { POST } = await import('@/app/api/collections/[platformProjectId]/invites/route')
    const response = await POST(
      new Request(`http://localhost/api/collections/${COLLECTION_ID}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'member' }),
      }),
      membersParams(),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { inviteUrl: string }
    expect(body.inviteUrl).toContain('/invite/')
    expect(addCollectionMemberOnPlexon).not.toHaveBeenCalled()
  })

  it('POST invites maps federation-off to a retryable 503', async () => {
    vi.mocked(createCollectionInviteOnPlexon).mockResolvedValue({
      ok: false,
      status: 503,
      error: 'federation_off',
    })
    const { POST } = await import('@/app/api/collections/[platformProjectId]/invites/route')
    const response = await POST(
      new Request(`http://localhost/api/collections/${COLLECTION_ID}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      membersParams(),
    )
    expect(response.status).toBe(503)
    const body = (await response.json()) as { error: { retryable: boolean } }
    expect(body.error.retryable).toBe(true)
  })
})
