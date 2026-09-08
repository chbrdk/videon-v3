import { describe, expect, it } from 'vitest'
import { authorizeFederationRequest, plexonUserId } from '@/lib/federation'
import { PLEXON_CONTRACT_VERSION_HEADER, PLEXON_FEDERATION_CONTRACT_VERSION, PLEXON_SERVICE_SECRET_HEADER, PLEXON_USER_HEADER } from '@videon-v3/contracts'

describe('federation machine actor headers', () => {
  it('accepts matching service secret + contract', () => {
    process.env.PLEXON_SERVICE_SECRET = 'test-secret-abcdefghijklmnopqrstuvwxyz012345'
    const req = new Request('http://localhost/api/media', {
      headers: {
        [PLEXON_SERVICE_SECRET_HEADER]: 'test-secret-abcdefghijklmnopqrstuvwxyz012345',
        [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
        [PLEXON_USER_HEADER]: 'user-actor-1',
      },
    })
    expect(authorizeFederationRequest(req)).toEqual({ ok: true })
    expect(plexonUserId(req)).toBe('user-actor-1')
  })
})
