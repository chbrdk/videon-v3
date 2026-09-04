#!/usr/bin/env node
/**
 * Apply reviewed SQL migrations from /migrations in lexical order.
 * Never runs schema push / drizzle migrate — only the checked-in .sql files.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'migrations')
const url = process.env.DATABASE_URL?.trim()

if (!url) {
  console.error('[VIDEON-v3] DATABASE_URL required for migrations.')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })
await client.connect()

try {
  await client.query(`
    create table if not exists videon_schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const { rows } = await client.query(
      'select 1 from videon_schema_migrations where id = $1',
      [file],
    )
    if (rows.length) {
      console.log(`[VIDEON-v3] skip ${file} (already applied)`)
      continue
    }

    const sql = await readFile(join(migrationsDir, file), 'utf8')
    console.log(`[VIDEON-v3] apply ${file}`)
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into videon_schema_migrations (id) values ($1)', [file])
      await client.query('commit')
    } catch (err) {
      await client.query('rollback')
      throw err
    }
  }

  console.log('[VIDEON-v3] SQL migrations up to date.')
} finally {
  await client.end()
}
