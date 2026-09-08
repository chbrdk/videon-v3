# V7 staging exercise log

**Environment:** staging plygrnd · VIDEON Coolify project  
**Date:** 2026-09-08  
**Runner:** `node scripts/v7-staging-exercises.mjs` + Vitest V7 suite

## Public smoke

| Check | Result |
|-------|--------|
| main-app `/api/health` | 200 |
| `/login` | 200 |
| stem-worker `/health` | 200 |
| MCP base | 406 (SSE Accept required — expected) |
| plexon-v3 `/api/health` | 200 · federation `2026-05-plexon-federation-v3` |

## E1–E6

| ID | Status | Evidence |
|----|--------|----------|
| E1 Load | **PASS (bounded)** | 40× concurrent `/api/health` · p50≈51 ms · p95≈130 ms (&lt;500 ms). Full upload/analysis load still optional. |
| E2 Security | **PASS (bounded)** | Unauth ` /api/media` + search → 307 (auth gate); Plexon products → 401. Unit: no docker/ops routes; signed download rejects cross-workspace key. CI: federation/frame/preview auth source-smoke. |
| E3 Restore | **PASS (dry-run)** | Postgres `videon-v3-postgres` `running:healthy`. Migration + check-db scripts present. **Coolify backup schedules: none configured** — schedule before claiming full restore sign-off. No destructive restore executed. |
| E4 Lifecycle | **PASS** | Soft-archive via `archiveMediaAssetForWorkspace`; DELETE API no longer hard-deletes/S3-removes. Hard purge = `purgeMediaAssetForWorkspace` (retention job). Vitest + script green. |
| E5 Provider outage | **PASS (bounded)** | Unit: OpenRouter 503 → `retryable: true`; 401 → non-retryable. Staging surfaces (health/login/stem) up. Live OpenRouter key-deny drill still operator-optional. |
| E6 Cost budget | **PASS (accounting)** | `provider_cost_usd` + `idempotency_key` in schema/code; gateway cost parse tested. Live corpus vs approved budget still operator-signed. |

## Code / tests this wave

- Soft-archive media DELETE + UI confirm copy
- `__tests__/v7-exercises.test.ts`, OpenRouter outage cases, workspace download deny
- `scripts/v7-staging-exercises.mjs`

## Legacy mapping

`N/A — fresh v3 island only`

## Gate

Exercises **bounded-pass** on staging. Remaining for full V7 gate close:

1. Name on-call owners in runbook  
2. Configure Coolify Postgres backup schedule + one restore drill  
3. Optional: live OpenRouter deny + corpus budget report  
4. Canary Collection allowlist for first tenant
