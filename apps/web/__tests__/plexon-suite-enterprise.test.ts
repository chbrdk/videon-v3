import { afterEach, describe, expect, it, vi } from 'vitest'
import { postCollectionActivityDistillate } from '../lib/plexon-collection-activity'
import { suiteAuditApiPath } from '../lib/plexon-suite-audit'

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
})
