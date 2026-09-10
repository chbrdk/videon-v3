import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    delete process.env.VIDEON_BOOTSTRAP_API_TOKEN
    delete process.env.VIDEON_BOOTSTRAP_API_OWNER_ID
  })

  it('ships durable api_tokens migration', () => {
    const sql = readFileSync(join(__dirname, '../../../migrations/0017_api_tokens.sql'), 'utf8')
    expect(sql).toContain('create table if not exists api_tokens')
    expect(sql).toContain('token_hash')
    expect(sql).toContain('owner_id')
  })

  it('creates, lists, resolves, and revokes tokens', async () => {
    const { stub, token } = await createApiToken('user-1', 'MCP')
    expect(token.startsWith(paths.apiTokenPrefix)).toBe(true)
    expect(await listApiTokens('user-1')).toHaveLength(1)
    expect((await listApiTokens('user-1'))[0]?.id).toBe(stub.id)

    const resolved = await resolveApiTokenOwner(`Bearer ${token}`)
    expect(resolved).toEqual({ ownerId: 'user-1', tokenId: stub.id })

    expect(await revokeApiToken(stub.id, 'user-1')).toBe(true)
    expect(await resolveApiTokenOwner(`Bearer ${token}`)).toBeNull()
    expect(await listApiTokens('user-1')).toHaveLength(0)
  })

  it('seeds bootstrap token from env with owner', async () => {
    const token = `${paths.apiTokenPrefix}${'ab'.repeat(paths.apiTokenBytes)}`
    process.env.VIDEON_BOOTSTRAP_API_TOKEN = token
    process.env.VIDEON_BOOTSTRAP_API_OWNER_ID = 'owner-bootstrap-1'
    try {
      const resolved = await resolveApiTokenOwner(`Bearer ${token}`)
      expect(resolved?.ownerId).toBe('owner-bootstrap-1')
      expect(resolved?.tokenId).toBe('tok-bootstrap')
    } finally {
      delete process.env.VIDEON_BOOTSTRAP_API_TOKEN
      delete process.env.VIDEON_BOOTSTRAP_API_OWNER_ID
    }
  })

  it('resolves owner from the token record without a separate owner field', async () => {
    const { token } = await createApiToken('plexon-user-42', 'Adobe panel')
    const resolved = await resolveApiTokenOwner(`Bearer ${token}`)
    expect(resolved).toEqual({ ownerId: 'plexon-user-42', tokenId: expect.any(String) })
  })

  it('bootstrap without OWNER_ID reuses owner already bound to that token hash', async () => {
    const { token } = await createApiToken('owner-from-token', 'Adobe')
    process.env.VIDEON_BOOTSTRAP_API_TOKEN = token
    delete process.env.VIDEON_BOOTSTRAP_API_OWNER_ID
    try {
      const resolved = await resolveApiTokenOwner(`Bearer ${token}`)
      expect(resolved?.ownerId).toBe('owner-from-token')
    } finally {
      delete process.env.VIDEON_BOOTSTRAP_API_TOKEN
    }
  })
})
