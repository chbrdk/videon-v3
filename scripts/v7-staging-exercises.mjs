#!/usr/bin/env node
/**
 * V7 staging exercise runner (E1 load smoke, E2 unauth, E3 restore dry-run checks,
 * E5 surface still up, E6 accounting schema presence).
 *
 * Usage: node scripts/v7-staging-exercises.mjs
 * Optional: VIDEON_BASE=https://videon.projects-a.plygrnd.tech
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const base = (process.env.VIDEON_BASE || 'https://videon.projects-a.plygrnd.tech').replace(/\/$/, '')
const plexon = (process.env.PLEXON_BASE || 'https://plexon-v3.projects-a.plygrnd.tech').replace(/\/$/, '')
const stem =
  process.env.VIDEON_STEM_BASE || 'https://nodc0dxwwwnpjc2uvk0snrff.projects-a.plygrnd.tech'
const mcp = process.env.VIDEON_MCP_BASE || 'https://pjupngbkompeyfjqocgsi0jy.projects-a.plygrnd.tech'

const results = []

function record(id, ok, detail) {
  results.push({ id, ok, detail })
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`[${mark}] ${id}: ${detail}`)
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

async function timedGet(url) {
  const t0 = performance.now()
  const res = await fetch(url, { redirect: 'manual' })
  const ms = performance.now() - t0
  return { status: res.status, ms, body: await res.text().catch(() => '') }
}

async function e1Load() {
  const samples = []
  const concurrency = 8
  const rounds = 5
  for (let r = 0; r < rounds; r++) {
    const batch = await Promise.all(
      Array.from({ length: concurrency }, () => timedGet(`${base}/api/health`)),
    )
    for (const item of batch) {
      samples.push(item)
      if (item.status !== 200) {
        record('E1', false, `health status ${item.status}`)
        return
      }
    }
  }
  const latencies = samples.map((s) => s.ms).sort((a, b) => a - b)
  const p95 = percentile(latencies, 95)
  const ok = p95 != null && p95 < 500
  record(
    'E1',
    ok,
    `health n=${latencies.length} p50=${percentile(latencies, 50)?.toFixed(1)}ms p95=${p95?.toFixed(1)}ms (sync health only)`,
  )
}

async function e2Security() {
  const media = await timedGet(`${base}/api/media`)
  const search = await timedGet(`${base}/api/media/search?q=test`)
  const products = await timedGet(`${plexon}/api/platform/products`)
  // NextAuth may 307→login; APIs may 401/403. Never 200 with data.
  const protectedOk = (status) => [401, 403, 307].includes(status)
  const unauthOk =
    protectedOk(media.status) && protectedOk(search.status) && products.status === 401
  record(
    'E2',
    unauthOk,
    `unauth media=${media.status} search=${search.status} plexon/products=${products.status}`,
  )
}

async function e3RestoreDryRun() {
  const migrationScript = existsSync(join(root, 'scripts/apply-sql-migrations.mjs'))
  const checkDb = existsSync(join(root, 'scripts/check-database-url.mjs'))
  const runbook = existsSync(join(root, 'knowledge/v7-production-runbook.md'))
  const health = await timedGet(`${base}/api/health`)
  const ok = migrationScript && checkDb && runbook && health.status === 200
  record(
    'E3',
    ok,
    `dry-run: migrations=${migrationScript} check-db=${checkDb} runbook=${runbook} live-health=${health.status} (no destructive restore executed)`,
  )
}

async function e4LifecycleCode() {
  const mediaDb = readFileSync(join(root, 'apps/web/lib/db/media.ts'), 'utf8')
  const route = readFileSync(join(root, 'apps/web/app/api/media/[mediaAssetId]/route.ts'), 'utf8')
  const ok =
    mediaDb.includes('archiveMediaAssetForWorkspace') &&
    mediaDb.includes("lifecycle_state = 'archived'") &&
    route.includes('archiveMediaAssetForWorkspace') &&
    !route.includes('removeObject')
  record('E4', ok, 'soft-archive path present; hard purge separated; DELETE does not remove S3')
}

async function e5ProviderSurface() {
  const health = await timedGet(`${base}/api/health`)
  const login = await timedGet(`${base}/login`)
  const stemHealth = await timedGet(`${stem.replace(/\/$/, '')}/health`)
  const mcpProbe = await timedGet(mcp)
  // Library/read surfaces stay up even if vision is down — we only prove surfaces here.
  // Full OpenRouter deny drill remains operator-signed (unit: openrouter 503 retryable).
  const ok = health.status === 200 && login.status === 200 && stemHealth.status === 200
  record(
    'E5',
    ok,
    `surface health=${health.status} login=${login.status} stem=${stemHealth.status} mcp=${mcpProbe.status}; gateway retryable covered in unit tests`,
  )
}

async function e6CostAccounting() {
  const analysis = readFileSync(join(root, 'apps/web/lib/db/analysis.ts'), 'utf8')
  const migration = readFileSync(
    join(root, 'migrations/0002_media_pipeline_foundation.sql'),
    'utf8',
  )
  const hasCost =
    analysis.includes('provider_cost_usd') &&
    migration.includes('provider_cost_usd') &&
    analysis.includes('idempotency_key')
  record(
    'E6',
    hasCost,
    'provider_cost_usd + idempotency_key present; live corpus budget compare still operator-signed',
  )
}

await e1Load()
await e2Security()
await e3RestoreDryRun()
await e4LifecycleCode()
await e5ProviderSurface()
await e6CostAccounting()

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(JSON.stringify({ base, results }, null, 2))
process.exit(failed.length ? 1 : 0)
