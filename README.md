# VIDEON v3

Collection-bound video intelligence and editing capability for PLEXON.

## Current delivery slice

V0–V2 foundation is live on staging:

- federation contracts and secure provisioning routes;
- Collection picker (PLEXON accessible-collections, Access Model B);
- Collection-bound workspace persistence + signed object-store upload;
- public and federation health;
- OpenRouter/Qwen policy boundary;
- v3 AppShell using `@msqdx/ui`.

Vision pipeline (V3/V4) and Cuts editor are not enabled yet.

The normative specifications are maintained in PLEXON:

- `../plexon-v3/specs/domain/videon-integration.md`
- `../plexon-v3/specs/api/videon-federation.md`

## Local setup

Copy `.env.example` to `.env.local`, configure a PostgreSQL database and federation secret, then run `npm install`, `npm run typecheck`, and `npm test`.

Do not set production secrets to development defaults. The service stays in `dummy` federation mode unless explicitly configured for live federation.
