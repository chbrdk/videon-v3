/**
 * In-memory API token store (Phase 1). Spec: specs/domain/settings-api-tokens.md
 */

import { createHash, randomBytes } from 'node:crypto'
import type { ApiTokenStub } from '@videon-v3/contracts'
import { paths } from '../paths'

export type ApiTokenRecord = {
  id: string
  ownerId: string
  label: string
  prefix: string
  tokenHash: string
  createdAt: string
  lastUsedAt: string | null
}

type Store = {
  byId: Map<string, ApiTokenRecord>
  byHash: Map<string, string>
}

const g = globalThis as unknown as { __videonApiTokensStore?: Store }

function store(): Store {
  if (!g.__videonApiTokensStore) {
    g.__videonApiTokensStore = { byId: new Map(), byHash: new Map() }
  }
  return g.__videonApiTokensStore
}

export function resetApiTokensStore(): void {
  store().byId.clear()
  store().byHash.clear()
}

export function hashApiToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

export function generateApiTokenString(): string {
  return `${paths.apiTokenPrefix}${randomBytes(paths.apiTokenBytes).toString('hex')}`
}

function newTokenId(): string {
  return `tok-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
}

function toStub(record: ApiTokenRecord): ApiTokenStub {
  return {
    id: record.id,
    label: record.label,
    prefix: record.prefix,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
  }
}

export function listApiTokens(ownerId?: string): ApiTokenStub[] {
  return [...store().byId.values()]
    .filter((t) => (ownerId ? t.ownerId === ownerId : true))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(toStub)
}

export function createApiToken(
  ownerId: string,
  label?: string | null,
): { stub: ApiTokenStub; token: string } {
  const token = generateApiTokenString()
  const tokenHash = hashApiToken(token)
  const prefix = token.slice(0, paths.apiTokenPrefix.length + 4)
  const record: ApiTokenRecord = {
    id: newTokenId(),
    ownerId,
    label: (label || '').trim() || 'API token',
    prefix,
    tokenHash,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  }
  store().byId.set(record.id, record)
  store().byHash.set(tokenHash, record.id)
  return { stub: toStub(record), token }
}

export function revokeApiToken(tokenId: string, ownerId: string): boolean {
  const row = store().byId.get(tokenId)
  if (!row || row.ownerId !== ownerId) return false
  store().byId.delete(tokenId)
  store().byHash.delete(row.tokenHash)
  return true
}

/**
 * Seed a durable-ish staging token from env (re-applied on each resolve).
 * Spec: settings-api-tokens.md § Bootstrap.
 * Env: VIDEON_BOOTSTRAP_API_TOKEN + VIDEON_BOOTSTRAP_API_OWNER_ID
 */
export function ensureBootstrapApiToken(): void {
  const raw = process.env.VIDEON_BOOTSTRAP_API_TOKEN?.trim()
  const ownerId = process.env.VIDEON_BOOTSTRAP_API_OWNER_ID?.trim()
  if (!raw || !ownerId || ownerId.length < 8) return
  if (!raw.startsWith(paths.apiTokenPrefix)) return
  const expectedLen = paths.apiTokenPrefix.length + paths.apiTokenBytes * 2
  if (raw.length !== expectedLen) return
  const tokenHash = hashApiToken(raw)
  const existingId = store().byHash.get(tokenHash)
  if (existingId) {
    const row = store().byId.get(existingId)
    if (row) row.ownerId = ownerId
    return
  }
  const id = 'tok-bootstrap'
  const record: ApiTokenRecord = {
    id,
    ownerId,
    label: 'Bootstrap (env)',
    prefix: raw.slice(0, paths.apiTokenPrefix.length + 4),
    tokenHash,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  }
  store().byId.set(id, record)
  store().byHash.set(tokenHash, id)
}

export function resolveApiTokenOwner(
  rawBearer: string | null | undefined,
): { ownerId: string; tokenId: string } | null {
  ensureBootstrapApiToken()
  if (!rawBearer) return null
  let raw = rawBearer.trim()
  if (raw.toLowerCase().startsWith('bearer ')) {
    raw = raw.slice(7).trim()
  }
  if (!raw.startsWith(paths.apiTokenPrefix)) return null
  const expectedLen = paths.apiTokenPrefix.length + paths.apiTokenBytes * 2
  if (raw.length !== expectedLen) return null
  const id = store().byHash.get(hashApiToken(raw))
  if (!id) return null
  const row = store().byId.get(id)
  if (!row) return null
  row.lastUsedAt = new Date().toISOString()
  return { ownerId: row.ownerId, tokenId: row.id }
}
