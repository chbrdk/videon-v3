# VIDEON v3

Collection-bound video intelligence and editing capability for PLEXON.

## Current delivery slice

This repository starts the V0–V2 foundation:

- federation contracts and secure provisioning routes;
- Collection-bound workspace persistence schema;
- public and federation health;
- OpenRouter/Qwen policy boundary;
- v3 AppShell foundation using `@msqdx/ui`.

The normative specifications are maintained in PLEXON:

- `../plexon-v3/specs/domain/videon-integration.md`
- `../plexon-v3/specs/api/videon-federation.md`

## Local setup

Copy `.env.example` to `.env.local`, configure a PostgreSQL database and federation secret, then run `npm install`, `npm run typecheck`, and `npm test`.

Do not set production secrets to development defaults. The service stays in `dummy` federation mode unless explicitly configured for live federation.
