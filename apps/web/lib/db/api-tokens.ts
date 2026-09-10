/**
 * Postgres Settings API tokens.
 * Spec: specs/domain/settings-api-tokens.md
 */

import { databasePool, hasDatabaseConfig } from './client'

export type ApiTokenRow = {
  id: string
  ownerId: string
  label: string
  prefix: string
  tokenHash: string
  createdAt: string
  lastUsedAt: string | null
}

type DbRow = {
  id: string
  owner_id: string
  label: string
  prefix: string
  token_hash: string
  created_at: Date | string
  last_used_at: Date | string | null
}

function mapRow(row: DbRow): ApiTokenRow {
  return {
    id: row.id,
    ownerId: row.owner_id,
    label: row.label,
    prefix: row.prefix,
    tokenHash: row.token_hash,
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
  }
}

export function canUseApiTokenDb(): boolean {
  return hasDatabaseConfig()
}

export async function dbListApiTokens(ownerId?: string): Promise<ApiTokenRow[]> {
  const result = ownerId
    ? await databasePool().query<DbRow>(
        `select id, owner_id, label, prefix, token_hash, created_at, last_used_at
         from api_tokens
         where owner_id = $1
         order by created_at desc`,
        [ownerId],
      )
    : await databasePool().query<DbRow>(
        `select id, owner_id, label, prefix, token_hash, created_at, last_used_at
         from api_tokens
         order by created_at desc`,
      )
  return result.rows.map(mapRow)
}

export async function dbInsertApiToken(row: {
  id: string
  ownerId: string
  label: string
  prefix: string
  tokenHash: string
  createdAt: string
}): Promise<ApiTokenRow> {
  const result = await databasePool().query<DbRow>(
    `insert into api_tokens (id, owner_id, label, prefix, token_hash, created_at)
     values ($1, $2, $3, $4, $5, $6::timestamptz)
     returning id, owner_id, label, prefix, token_hash, created_at, last_used_at`,
    [row.id, row.ownerId, row.label, row.prefix, row.tokenHash, row.createdAt],
  )
  return mapRow(result.rows[0]!)
}

export async function dbUpsertBootstrapApiToken(row: {
  id: string
  ownerId: string
  label: string
  prefix: string
  tokenHash: string
  createdAt: string
}): Promise<ApiTokenRow> {
  const result = await databasePool().query<DbRow>(
    `insert into api_tokens (id, owner_id, label, prefix, token_hash, created_at)
     values ($1, $2, $3, $4, $5, $6::timestamptz)
     on conflict (token_hash) do update set
       owner_id = excluded.owner_id,
       label = excluded.label,
       prefix = excluded.prefix
     returning id, owner_id, label, prefix, token_hash, created_at, last_used_at`,
    [row.id, row.ownerId, row.label, row.prefix, row.tokenHash, row.createdAt],
  )
  return mapRow(result.rows[0]!)
}

export async function dbFindApiTokenByHash(tokenHash: string): Promise<ApiTokenRow | null> {
  const result = await databasePool().query<DbRow>(
    `select id, owner_id, label, prefix, token_hash, created_at, last_used_at
     from api_tokens
     where token_hash = $1
     limit 1`,
    [tokenHash],
  )
  const row = result.rows[0]
  return row ? mapRow(row) : null
}

export async function dbTouchApiTokenLastUsed(tokenId: string): Promise<void> {
  await databasePool().query(`update api_tokens set last_used_at = now() where id = $1`, [tokenId])
}

export async function dbRevokeApiToken(tokenId: string, ownerId: string): Promise<boolean> {
  const result = await databasePool().query(
    `delete from api_tokens where id = $1 and owner_id = $2`,
    [tokenId, ownerId],
  )
  return (result.rowCount ?? 0) > 0
}
