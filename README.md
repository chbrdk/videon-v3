# VIDEON v3

Collection-bound video intelligence and editing capability for PLEXON.

## Current delivery slice

V0–V4 foundation is live on staging:

- federation contracts and secure provisioning routes;
- Collection picker (PLEXON accessible-collections, Access Model B);
- Collection-bound workspace persistence + direct object-store upload;
- durable media analysis pipeline (`pg-boss`) with FFprobe/frame sampling;
- OpenRouter/Qwen vision stages with schema validation + fallback lane;
- scene insight v2 + Brandion brand-compliance seam (multi-frame evidence);
- analyses UI with auto-start after upload complete;
- public and federation health;
- v3 AppShell using `@msqdx/ui`.

Cuts editor and advanced audio/transcript branches continue to evolve.

The normative specifications are maintained in PLEXON:

- `../plexon-v3/specs/domain/videon-integration.md`
- `../plexon-v3/specs/api/videon-federation.md`

Operator notes in this repo:

- [`knowledge/brand-compliance.md`](knowledge/brand-compliance.md) — Brandion seam, multi-frame evidence, statuses, ops checklist
- [`knowledge/paths.md`](knowledge/paths.md) — route helpers and env keys

## Local setup

Copy `.env.example` to `.env.local`, configure a PostgreSQL database and federation secret, then run `npm install`, `npm run typecheck`, and `npm test`.

Do not set production secrets to development defaults. The service stays in `dummy` federation mode unless explicitly configured for live federation.

For live Brandion checks set `BRANDION_API_URL` (preferred) or `NEXT_PUBLIC_BRANDION_URL` plus `PLEXON_SERVICE_SECRET`. See `knowledge/brand-compliance.md`.
