/**
 * Settings API token store — Postgres when DATABASE_URL is set, else in-memory (tests).
 * Spec: settings-api-tokens.md
 *
 * Owner id is stored with the token hash. Clients discover it via POST /api/tokens/verify
 * (no separate owner env required for UI-created tokens).
 */

import type { ApiTokenStub } from '@videon-v3/contracts'
import { createHash, randomBytes } from 'node:crypto'
import {
  canUseApiTokenDb,
  dbFindApiTokenByHash,
  dbInsertApiToken,
  dbListApiTokens,
  dbRevokeApiToken,
  dbTouchApiTokenLastUsed,
  dbUpsertBootstrapApiToken,
} from '../db/api-tokens'
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

function memory(): Store {
  if (!g.__videonApiTokensStore) {
    g.__videonApiTokensStore = { byId: new Map(), byHash: new Map() }
  }
  return g.__videonApiTokensStore
}

export function resetApiTokensStore(): void {
  memory().byId.clear()
  memory().byHash.clear()
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

function parseBearer(rawBearer: string | null | undefined): string | null {
  if (!rawBearer) return null
  let raw = rawBearer.trim()
  if (raw.toLowerCase().startsWith('bearer ')) {
    raw = raw.slice(7).trim()
  }
  if (!raw.startsWith(paths.apiTokenPrefix)) return null
  const expectedLen = paths.apiTokenPrefix.length + paths.apiTokenBytes * 2
  if (raw.length !== expectedLen) return null
  return raw
}

function memoryPut(record: ApiTokenRecord): void {
  memory().byId.set(record.id, record)
  memory().byHash.set(record.tokenHash, record.id)
}

function memoryList(ownerId?: string): ApiTokenStub[] {
  return [...memory().byId.values()]
    .filter((t) => (ownerId ? t.ownerId === ownerId : true))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(toStub)
}

/**
 * Seed bootstrap token from env.
 * - With OWNER_ID: upsert into DB/memory.
 * - Without OWNER_ID: if token hash already exists (UI-created / prior seed), reuse that owner.
 */
export async function ensureBootstrapApiToken(): Promise<void> {
  const raw = process.env.VIDEON_BOOTSTRAP_API_TOKEN?.trim()
  if (!raw || !raw.startsWith(paths.apiTokenPrefix)) return
  const expectedLen = paths.apiTokenPrefix.length + paths.apiTokenBytes * 2
  if (raw.length !== expectedLen) return

  const tokenHash = hashApiToken(raw)
  const ownerFromEnv = process.env.VIDEON_BOOTSTRAP_API_OWNER_ID?.trim() || ''
  let ownerId = ownerFromEnv.length >= 8 ? ownerFromEnv : ''

  if (!ownerId && canUseApiTokenDb()) {
    try {
      const existing = await dbFindApiTokenByHash(tokenHash)
      if (existing?.ownerId) ownerId = existing.ownerId
    } catch {
      /* table may not exist yet during first boot race */
    }
  }
  if (!ownerId) {
    const memId = memory().byHash.get(tokenHash)
    const memRow = memId ? memory().byId.get(memId) : null
    if (memRow?.ownerId) ownerId = memRow.ownerId
  }
  if (!ownerId) return

  const record: ApiTokenRecord = {
    id: 'tok-bootstrap',
    ownerId,
    label: 'Bootstrap (env)',
    prefix: raw.slice(0, paths.apiTokenPrefix.length + 4),
    tokenHash,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  }

  if (canUseApiTokenDb()) {
    try {
      const saved = await dbUpsertBootstrapApiToken(record)
      memoryPut({ ...record, id: saved.id, ownerId: saved.ownerId })
      return
    } catch {
      /* fall through to memory */
    }
  }
  memoryPut(record)
}

export async function listApiTokens(ownerId?: string): Promise<ApiTokenStub[]> {
  await ensureBootstrapApiToken()
  if (canUseApiTokenDb()) {
    try {
      const rows = await dbListApiTokens(ownerId)
      return rows.map((row) =>
        toStub({
          id: row.id,
          ownerId: row.ownerId,
          label: row.label,
          prefix: row.prefix,
          tokenHash: row.tokenHash,
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt,
        }),
      )
    } catch {
      /* fall back */
    }
  }
  return memoryList(ownerId)
}

export async function createApiToken(
  ownerId: string,
  label?: string | null,
): Promise<{ stub: ApiTokenStub; token: string }> {
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

  if (canUseApiTokenDb()) {
    try {
      const saved = await dbInsertApiToken(record)
      memoryPut({ ...record, id: saved.id })
      return { stub: toStub({ ...record, id: saved.id }), token }
    } catch {
      /* fall back to memory so Settings still works if migration lag */
    }
  }

  memoryPut(record)
  return { stub: toStub(record), token }
}

export async function revokeApiToken(tokenId: string, ownerId: string): Promise<boolean> {
  let ok = false
  if (canUseApiTokenDb()) {
    try {
      ok = await dbRevokeApiToken(tokenId, ownerId)
    } catch {
      ok = false
    }
  }
  const row = memory().byId.get(tokenId)
  if (row && row.ownerId === ownerId) {
    memory().byId.delete(tokenId)
    memory().byHash.delete(row.tokenHash)
    ok = true
  }
  return ok
}

/**
 * Resolve Bearer → owner. Owner comes from the token record (DB/memory), not a separate panel field.
 */
export async function resolveApiTokenOwner(
  rawBearer: string | null | undefined,
): Promise<{ ownerId: string; tokenId: string } | null> {
  await ensureBootstrapApiToken()
  const raw = parseBearer(rawBearer)
  if (!raw) return null
  const tokenHash = hashApiToken(raw)

  if (canUseApiTokenDb()) {
    try {
      const row = await dbFindApiTokenByHash(tokenHash)
      if (row) {
        void dbTouchApiTokenLastUsed(row.id)
        memoryPut({
          id: row.id,
          ownerId: row.ownerId,
          label: row.label,
          prefix: row.prefix,
          tokenHash: row.tokenHash,
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt,
        })
        return { ownerId: row.ownerId, tokenId: row.id }
      }
    } catch {
      /* fall through */
    }
  }

  const id = memory().byHash.get(tokenHash)
  if (!id) return null
  const row = memory().byId.get(id)
  if (!row) return null
  row.lastUsedAt = new Date().toISOString()
  return { ownerId: row.ownerId, tokenId: row.id }
}
