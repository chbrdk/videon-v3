# VIDEON v3 — Production / staging runbook (V7)

**Status:** Draft for sign-off · 2026-09-08  
**Spec:** `specs/domain/v7-production-rollout.md` · upstream `plexon-v3/specs/domain/videon-integration.md` § V7  
**Paths:** `knowledge/paths.md`  
**Coolify project:** `VIDEON` `cw8w44ow48kckog88coookg0`

This is the operator SoT for V7. Do not hardcode FQDNs in app code — resolve via env + `paths.ts` / `runtime-config.ts`.

---

## 1. Inventory (staging plygrnd)

| Resource | Coolify UUID | FQDN / note |
|----------|--------------|-------------|
| `videon-v3:main-app` | `mi0j3pyjrel80jodebwvhgvi` | `https://videon.projects-a.plygrnd.tech` · health `/api/health` · port 3010 |
| `videon-mcp` | `pjupngbkompeyfjqocgsi0jy` | MCP SSE · no video binaries |
| `videon-v3:stem-worker` | `nodc0dxwwwnpjc2uvk0snrff` | Stem Demucs · see `staging-coolify-stem-worker.md` |
| `videon-v3-postgres` | `qvh3hghdbjggzs8bysk9qrqc` | App DB (not shared with v2) |
| Legacy `videon` (v2) | `q8c8gwwck404k04okkkwskgk` | **Freeze** — do not use for v3 canary; archive only after V7 window |

PLEXON control plane (v3 island): `plexon-v3:main-app` · `https://plexon-v3.projects-a.plygrnd.tech` · federation `2026-05-plexon-federation-v3`.

---

## 2. On-call ownership

| Role | Responsibility | Named (sign-off) |
|------|----------------|------------------|
| VIDEON primary | App, worker, MCP, stem, media pipeline | ☐ ________________ |
| VIDEON secondary | Backup cover | ☐ ________________ |
| Platform / Coolify | Deploy, TLS, shared env, Plexon binding | ☐ ________________ |
| Security liaison | Retention, provider privacy, access reviews | ☐ ________________ |

Escalate: Coolify unhealthy → `list_deployments` / `get_deployment(include_log_summary=true)` before raw logs. Never paste secrets into tickets.

---

## 3. Deploy order

1. Postgres healthy (`videon-v3-postgres`).
2. Apply reviewed migrations (migration job — **never** schema push on app start).
3. Deploy `videon-v3:main-app` (web + worker as configured).
4. Deploy / verify stem-worker if analysis bundles need Demucs.
5. Deploy `videon-mcp` after main-app health is green.
6. Smoke PLEXON → VIDEON binding / health from Collection dashboard.

Rollback of vision lane is **independent** of app image: unset/rotate OpenRouter route or disable new analysis enqueue; do not silently re-enable local MLX/Ollama in production.

---

## 4. Public smoke (every deploy)

```bash
curl -fsS https://videon.projects-a.plygrnd.tech/api/health
curl -fsS -o /dev/null -w "%{http_code}\n" https://videon.projects-a.plygrnd.tech/login
curl -fsS https://nodc0dxwwwnpjc2uvk0snrff.projects-a.plygrnd.tech/health
# MCP speaks SSE — expect 406 without Accept: text/event-stream
curl -sS -o /dev/null -w "%{http_code}\n" https://pjupngbkompeyfjqocgsi0jy.projects-a.plygrnd.tech/
curl -fsS https://plexon-v3.projects-a.plygrnd.tech/api/health
```

Pass: main-app `{"status":"ok","service":"videon"}`, login `200`, stem `ok`, MCP not 5xx, Plexon health `200` with matching federation contract.

Authenticated E2E (upload → analysis → search → Cut) needs a canary Collection + test user — record in the exercise log.

---

## 5. Staging exercises E1–E6

| ID | How to run (staging) | Pass |
|----|----------------------|------|
| E1 Load | Concurrent `upload-intent` + list/search against canary Collection; watch p95 and queue depth | Under objectives in integration spec § Observability |
| E2 Security | CI negative multi-tenant + manual: other Collection IDs on media/frame/preview → 403/404; no `/api` Docker-control | Green CI + spot-check |
| E3 Restore | Snapshot Postgres volume + critical bucket prefix; restore to throwaway staging; verify workspace + media readable | Checklist signed |
| E4 Lifecycle | Soft-archive media/cut (`DELETE` media → `lifecycle_state=archived`; object bytes retained) → confirm hidden from default lists → hard purge via `purgeMediaAssetForWorkspace` after retention days `R` | Procedure + sample |
| E5 Provider outage | Block OpenRouter (bad key / deny route) → enqueue analysis → expect retryable fail; library/playback OK | Drill log |
| E6 Cost budget | Versioned corpus analysis run; compare token/cost to approved budget; confirm usage idempotency | Budget report |

Evidence: `knowledge/v7-staging-exercise-log.md`.

---

## 6. Canary by Collection

1. Maintain an allowlist of `platformProjectId` (canary Collections) — Access Model B only (owner + projected members).
2. Enable VIDEON product binding **only** for that list in PLEXON.
3. Observation window (default proposal: 48–72h staging, longer for first prod tenant): analysis success %, 5xx rate, OpenRouter cost, storage errors, access denials.
4. Expand list only when metrics hold; on breach: stop expansion, disable new vision enqueue, keep read/export.
5. Keep `CAPABILITY_CATALOG_RUNTIME` default **off** unless a separate catalog canary is signed.

---

## 7. Backup / restore

- **Postgres:** Coolify/DB snapshot before destructive migrations and before legacy import. Restore tested at least once per quarter (or before first prod cutover).
- **Object storage:** bucket versioning or prefix snapshots per deployment policy; restore must re-attach keys referenced by `media_assets.storage_key`.
- **Secrets:** rotate via Coolify env — never bake into images.
- Evidence of last successful restore lives in the exercise log (E3).

---

## 8. Deletion / retention

Baseline until legal/product overrides (must be set before external customer media):

| Object | Soft state | Hard delete |
|--------|------------|-------------|
| Media asset | `lifecycle_state = archived` (hidden from default lists) | After retention window + confirmed no Cut references / export holds |
| Cut | `status = archived` | Same window; exports are separate jobs — do not orphan without audit |
| Analysis runs | Retained for provenance; cancel in-flight on media archive | Purge with media hard delete |
| Derivatives / frames / stems | Cascade with media hard delete; monitor orphan counts | Lifecycle job |
| Provider payloads | Never store raw provider media; redact URLs from logs | N/A |

Operator procedure:

1. User/API soft-archive (writable Collection required).
2. Confirm UI/API hide + federation summary degraded/absent as designed.
3. After retention days `R` (env/policy TBD before customer media), run documented purge (DB row + object keys).
4. Record ticket id + counts in exercise log.

---

## 9. Rollback drill

| Layer | Action | Expected |
|-------|--------|----------|
| Vision / OpenRouter | Disable new analysis or switch approved route | Library + playback + export continue; jobs remain durable |
| App deploy | Redeploy previous known-good Coolify deployment | In-flight jobs resume; no discarded queue |
| Federation | PLEXON marks VIDEON degraded/unavailable | Other Collection capabilities continue |
| Schema | Expand/migrate/contract only; no destructive contract without backup | Compatibility window held |

Do **not** roll production vision back to unmanaged local model services after cutover (integration § Rollback principles).

---

## 10. Legacy archive

After mapping report + export window:

1. Confirm no production traffic to legacy Coolify `videon` (`q8c8gwwck404k04okkkwskgk`).
2. Export any opted-in mapped workspaces via migration tooling using `videon.legacy-migration.v1`.
3. Quarantine unresolved rows; do not delete quarantine until ownership resolved or legal hold lifts.
4. Stop legacy app → archive image/config → remove obsolete model services/secrets.
5. Sign off in exercise log.

---

## 11. Gate status

See checklist in `specs/domain/v7-production-rollout.md` / upstream § V7.  
**In-repo docs ≠ gate closed** — named signatures + E1–E6 evidence required.
