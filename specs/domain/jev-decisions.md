# Jev decisions (shadow) — VIDEON

**Status:** Stub — follow PLEXON `specs/domain/jev-decisions.md`  
**Transport:** OpenRouter Decisions API (same key as vision gateway) · model `typesafe/jev-1.13`

## Fuzzy candidates

| ID | Baseline | Questions |
|----|----------|-----------|
| `videon.frame_route` | which frames need VL analysis | Choice skip/analyze |
| `videon.schema_valid_enough` | local schema gate before repair | Noul |
| `videon.escalate_vl_lane` | Flash → 30B fallback | Noul |

Vision **description** stays Qwen on OpenRouter chat. Jev only gates/routes.

## Env

Reuse `OPENROUTER_API_KEY` / `OPENROUTER_API_BASE_URL` from `lib/paths.ts`. Add `JEV_SHADOW_ENABLED` + `JEV_ACT_*`.
