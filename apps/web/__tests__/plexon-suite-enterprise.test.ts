import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { postCollectionActivityDistillate } from '../lib/plexon-collection-activity'
import {
  CLIENT_ROOM_SLOT_VIDEON_CUT,
  clientRoomSlotApiPath,
  putClientRoomSlot,
} from '../lib/plexon-client-room'
import { shareLinksApiPath, upsertShareLink } from '../lib/plexon-share-links'
import { suiteAuditApiPath } from '../lib/plexon-suite-audit'

const root = path.join(__dirname, '..')

describe('plexon suite enterprise clients (videon)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('builds audit provisioning path', () => {
    vi.stubEnv('PLEXON_AUTH_URL', 'https://plexon.test')
    vi.stubEnv('PLEXON_SERVICE_SECRET', 'sec')
    vi.stubEnv('PLEXON_FEDERATION_MODE', 'live')
    expect(suiteAuditApiPath('pp-9')).toContain('/audit')
  })

  it('POSTs activity body shape', async () => {
    vi.stubEnv('PLEXON_AUTH_URL', 'https://plexon.test')
    vi.stubEnv('PLEXON_SERVICE_SECRET', 'sec')
    vi.stubEnv('PLEXON_FEDERATION_MODE', 'live')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await postCollectionActivityDistillate({
      platformProjectId: 'pp-9',
      productId: 'videon',
      kind: 'analysis_run',
      status: 'succeeded',
      subjectRef: 'run-1',
      title: 'Clip',
    })
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      productId: 'videon',
      kind: 'analysis_run',
      status: 'succeeded',
      subjectRef: 'run-1',
      title: 'Clip',
    })
  })

  it('builds client-room slot path for videon_cut', () => {
    vi.stubEnv('PLEXON_AUTH_URL', 'https://plexon.test')
    expect(CLIENT_ROOM_SLOT_VIDEON_CUT).toBe('videon_cut')
    expect(clientRoomSlotApiPath('pp-9', CLIENT_ROOM_SLOT_VIDEON_CUT)).toBe(
      'https://plexon.test/api/platform/provisioning/collections/pp-9/client-room/slots/videon_cut',
    )
  })

  it('skips client-room PUT when federation is not live', async () => {
    vi.stubEnv('PLEXON_AUTH_URL', 'https://plexon.test')
    vi.stubEnv('PLEXON_SERVICE_SECRET', 'sec')
    vi.stubEnv('PLEXON_FEDERATION_MODE', 'dummy')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(
      await putClientRoomSlot({
        platformProjectId: 'pp-9',
        slotId: CLIENT_ROOM_SLOT_VIDEON_CUT,
        productId: 'videon',
        subjectRef: 'cut-1',
        title: 'Cut',
        actorUserId: 'user-1',
      }),
    ).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('PUTs videon_cut slot and soft-skips room_missing', async () => {
    vi.stubEnv('PLEXON_AUTH_URL', 'https://plexon.test')
    vi.stubEnv('PLEXON_SERVICE_SECRET', 'sec')
    vi.stubEnv('PLEXON_FEDERATION_MODE', 'live')
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    vi.stubGlobal('fetch', fetchMock)
    expect(
      await putClientRoomSlot({
        platformProjectId: 'pp-9',
        slotId: CLIENT_ROOM_SLOT_VIDEON_CUT,
        productId: 'videon',
        subjectRef: 'cut-1',
        title: 'Cut A',
        actorUserId: 'user-1',
        href: '/cuts/cut-1?platformProjectId=pp-9',
      }),
    ).toBe(false)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/client-room/slots/videon_cut')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toMatchObject({
      actorUserId: 'user-1',
      productId: 'videon',
      subjectRef: 'cut-1',
      title: 'Cut A',
    })
  })

  it('builds share-links path and POSTs cut projection', async () => {
    vi.stubEnv('PLEXON_AUTH_URL', 'https://plexon.test')
    vi.stubEnv('PLEXON_SERVICE_SECRET', 'sec')
    vi.stubEnv('PLEXON_FEDERATION_MODE', 'live')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    expect(shareLinksApiPath('pp-9')).toContain('/share-links')
    expect(
      await upsertShareLink({
        platformProjectId: 'pp-9',
        productId: 'videon',
        shareId: 'cut-1',
        kind: 'cut',
        title: 'Cut A',
        href: 'https://videon.test/cuts/cut-1',
        actorUserId: 'user-1',
      }),
    ).toBe(true)
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toMatchObject({
      productId: 'videon',
      kind: 'cut',
      shareId: 'cut-1',
    })
  })

  it('client-room-approve dual-writes share-links', () => {
    const route = readFileSync(
      path.join(root, 'app/api/cuts/[cutId]/client-room-approve/route.ts'),
      'utf8',
    )
    expect(route).toContain('scheduleUpsertShareLink')
    expect(route).toContain("kind: 'cut'")
  })
})
