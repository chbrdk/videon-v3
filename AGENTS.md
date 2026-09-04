# AGENTS.md — VIDEON v3

1. Specs first: behaviour follows `PLEXON/specs/domain/videon-integration.md` and `PLEXON/specs/api/videon-federation.md`.
2. A Collection is the only user-facing project. VIDEON owns a Collection-bound workspace; legacy editing `Project` is named **Cut**.
3. New/rebuilt UI composes `@msqdx/ui`. Add missing primitives upstream to `msqdx-ui`; do not build local primitive clones. No MUI and no `@msqdx/react`.
4. Do not hardcode service bases, storage paths, or provider model IDs. Resolve them from `lib/paths.ts` / `lib/runtime-config.ts`.
5. Production visual inference uses OpenRouter. Qwen3.7 Flash is the default cost lane; executable local schema validation and an approved strict-schema fallback are mandatory.
6. All media and jobs are Collection-scoped. Authentication and authorization are required for every non-public resource.
7. Long-running media work is durable and idempotent. No fire-and-forget timers, Docker-control routes, default admin accounts, fallback production secrets, or schema push on application startup.
8. Tests with every change: contract, API/access, UI smoke, typecheck, and build validation in proportion to the change.
9. Federation contract is `2026-05-plexon-federation-v3`. PLEXON remains the production control plane.
10. Access Model B is fail closed: a workspace admits its owner and explicitly projected
    `videon_workspace_members`, never everyone in the company.
