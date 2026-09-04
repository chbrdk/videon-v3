import { Pool } from 'pg'
import { databaseUrl } from '../runtime-config'

let pool: Pool | null = null

export function hasDatabaseConfig(): boolean {
  return Boolean(databaseUrl())
}

export function databasePool(): Pool {
  const connectionString = databaseUrl()
  if (!connectionString) throw new Error('DATABASE_URL is required for persistent VIDEON state')
  if (!pool) {
    pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 20_000 })
  }
  return pool
}

export async function probeDatabase(): Promise<'ready' | 'unconfigured' | 'unavailable'> {
  if (!hasDatabaseConfig()) return 'unconfigured'
  try {
    await databasePool().query('select 1')
    return 'ready'
  } catch {
    return 'unavailable'
  }
}
