import { describe, expect, it, beforeEach } from 'vitest'
import {
  createApiToken,
  listApiTokens,
  resetApiTokensStore,
  resolveApiTokenOwner,
  revokeApiToken,
} from '@/lib/fixtures/api-tokens-store'
import { paths } from '@/lib/paths'

describe('api tokens store', () => {
  beforeEach(() => {
    resetApiTokensStore()
  })

  it('creates, lists, resolves, and revokes tokens', () => {
    const { stub, token } = createApiToken('user-1', 'MCP')
    expect(token.startsWith(paths.apiTokenPrefix)).toBe(true)
    expect(listApiTokens('user-1')).toHaveLength(1)
    expect(listApiTokens('user-1')[0]?.id).toBe(stub.id)

    const resolved = resolveApiTokenOwner(`Bearer ${token}`)
    expect(resolved).toEqual({ ownerId: 'user-1', tokenId: stub.id })

    expect(revokeApiToken(stub.id, 'user-1')).toBe(true)
    expect(resolveApiTokenOwner(`Bearer ${token}`)).toBeNull()
    expect(listApiTokens('user-1')).toHaveLength(0)
  })

  it('seeds bootstrap token from env', () => {
    const token = `${paths.apiTokenPrefix}${'ab'.repeat(paths.apiTokenBytes)}`
    process.env.VIDEON_BOOTSTRAP_API_TOKEN = token
    process.env.VIDEON_BOOTSTRAP_API_OWNER_ID = 'owner-bootstrap-1'
    try {
      const resolved = resolveApiTokenOwner(`Bearer ${token}`)
      expect(resolved?.ownerId).toBe('owner-bootstrap-1')
      expect(resolved?.tokenId).toBe('tok-bootstrap')
    } finally {
      delete process.env.VIDEON_BOOTSTRAP_API_TOKEN
      delete process.env.VIDEON_BOOTSTRAP_API_OWNER_ID
    }
  })
})
