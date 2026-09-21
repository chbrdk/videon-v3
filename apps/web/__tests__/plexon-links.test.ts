import { afterEach, describe, expect, it, vi } from 'vitest'

describe('videon plexon-links', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('builds forgot-password URL from NEXT_PUBLIC_PLEXON_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_PLEXON_URL', 'https://plexon.example.com')
    const { getPlexonForgotPasswordUrl } = await import('../lib/plexon-links')
    expect(getPlexonForgotPasswordUrl()).toBe('https://plexon.example.com/forgot-password')
  })

  it('returns null when public plexon URL unset', async () => {
    const { getPlexonForgotPasswordUrl } = await import('../lib/plexon-links')
    expect(getPlexonForgotPasswordUrl()).toBeNull()
  })
})
