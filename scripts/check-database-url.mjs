#!/usr/bin/env node
/**
 * Startup guard: print safe DATABASE_URL diagnostics (no password).
 */
const urlRaw = process.env.DATABASE_URL?.trim()
if (!urlRaw) {
  console.error('[VIDEON-v3] DATABASE_URL is unset.')
  process.exit(1)
}

let parsed
try {
  parsed = new URL(urlRaw)
} catch {
  console.error('[VIDEON-v3] DATABASE_URL is not a valid URL. Check Coolify env (Runtime).')
  process.exit(1)
}

const host = parsed.hostname || '(empty)'
const port = parsed.port || '5432'
const dbName = parsed.pathname?.replace(/^\//, '') || '(none)'
const user = decodeURIComponent(parsed.username || '')

console.log(
  `[VIDEON-v3] DATABASE_URL ok-ish → user=${user || '(none)'} host=${host} port=${port} database=${dbName}`,
)

if (host.includes('{{') || host.includes('}}')) {
  console.error('[VIDEON-v3] DATABASE_URL still contains Coolify template braces — expansion failed.')
  process.exit(1)
}

process.exit(0)
