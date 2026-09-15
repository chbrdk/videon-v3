# Coolify — OpenRouter video generation (staging)

**Project:** VIDEON  
**Companions:** `specs/domain/media-generative-edit.md` · `knowledge/ai-clip-generation.md` · `knowledge/paths.md`

Generation runs **inside the main web app worker** (pg-boss `videon.media.generate`). Gateway is **OpenRouter Video API** (`POST /api/v1/videos`) — same `OPENROUTER_API_KEY` as vision analysis. No fal.ai key.

## Wire main app

On `videon-v3:main-app`:

| Env | Required | Notes |
|-----|----------|--------|
| `OPENROUTER_API_KEY` | yes | Already used for vision |
| `OPENROUTER_API_BASE_URL` | no | Default `https://openrouter.ai/api/v1` |
| `VIDEON_GENERATION_MAX_EDIT_MS` | no | Default `12000` |
| `VIDEON_GENERATION_MAX_CONCURRENT` | no | Default `2` per workspace |
| `VIDEON_GENERATION_SEEDANCE_MODEL` | no | Default `bytedance/seedance-2.5` |
| `VIDEON_GENERATION_VEO_MODEL` | no | Default `google/veo-3.1` |
| `VIDEON_GENERATION_WAN_MODEL` | no | Default `alibaba/wan-3.0` |
| `VIDEON_GENERATION_MINIMAX_MODEL` | no | Default `minimax/hailuo-3-max` |
| `VIDEON_GENERATION_MINIMAX_EDIT_MODEL` | no | Default `minimax/hailuo-3` |
| `VIDEON_GENERATION_ALEPH_MODEL` | no | When set, enables `runway_aleph_2` |

Also require Postgres + pg-boss + object store (signed GET URLs must be reachable by OpenRouter for edit source slices).

### ZDR caveat

OpenRouter **video generation is not ZDR-eligible**. VIDEON must not send `zdr: true` on `/videos` requests. If account-wide ZDR enforcement blocks video routing, allow video outside ZDR (vision may still use ZDR).

Redeploy main after env changes. No separate Dockerfile.

## Verify

1. Media editor → mark 1–12s → **AI Edit** → draft → approve → promoted asset.
2. Mediathek → **Neuer AI-Clip**.
3. Logs should mention OpenRouter video ids, not fal request ids.
4. Aleph stays hidden until `VIDEON_GENERATION_ALEPH_MODEL` is set.

## Deprecated

`VIDEON_FAL_API_KEY` / `VIDEON_FAL_API_BASE_URL` / `*_ENDPOINT` overrides are ignored for the primary gateway (legacy aliases may still map model slugs).
