import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportLlmUsage, reportUsage } from '../lib/usage-report'

describe('videon usage-report', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('no-ops without plexon config', () => {
    vi.stubEnv('PLEXON_AUTH_URL', '')
    vi.stubEnv('PLEXON_SERVICE_SECRET', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    reportUsage({ userId: 'u1', eventType: 'llm_request', rawUnits: {} })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts llm_request for videon', () => {
    vi.stubEnv('PLEXON_AUTH_URL', 'https://plexon.example')
    vi.stubEnv('PLEXON_SERVICE_SECRET', 'sec')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    reportLlmUsage({
      userId: 'u1',
      usage: { input_tokens: 50, output_tokens: 20, model: 'vision' },
      surface: 'videon.vision',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))
    expect(body).toMatchObject({
      user_id: 'u1',
      service: 'videon',
      event_type: 'llm_request',
    })
  })
})
