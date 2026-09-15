# AI clip generation (VIDEON)

Operator playbook for generative edit/create. Normative rules: `specs/domain/media-generative-edit.md`.

## Model matrix (2026-09)

| Intent | Prefer | Notes |
|--------|--------|-------|
| Object / subject replace | Seedance 2.5 Edit (`seedance_2_5_edit`) | Keep motion; pass reference stills of the target |
| Instruction / brand text / motion transfer | MiniMax H3 Edit (`minimax_hailuo_3_edit`) | OpenRouter `minimax/hailuo-3` · 2K · 5–15s |
| Cheap draft preview | Same Seedance @ 480p or `happy_horse_draft` | Approve before spendy final |
| Keyframe-precise edit | Runway Aleph 2.0 (`runway_aleph_2`) | Enabled only when `VIDEON_GENERATION_ALEPH_MODEL` is set |
| Photoreal create / extend | Veo 3.1 (`veo_3_1_create`) | OpenRouter `google/veo-3.1` |
| Cost-efficient Veo create | Veo 3.1 Lite (`veo_3_1_lite_create`) | OpenRouter `google/veo-3.1-lite` · 4–8s |
| Long / story create | Wan 3.0 (`wan_3_0_create`) | OpenRouter `alibaba/wan-3.0` · up to 30s |
| Fast create | MiniMax H3 Max (`minimax_hailuo_3_create`) | OpenRouter `minimax/hailuo-3-max` · 480p/768p |
| High-volume create | Seedance 2.5 T2V/I2V | Create |

Gateway: **OpenRouter Video API** (`POST /api/v1/videos`, server-only). Reuses `OPENROUTER_API_KEY`.  
Catalog ids in `apps/web/lib/generation/model-catalog.ts`.  
Client: `apps/web/lib/generation/openrouter-video-client.ts`.  
Recommend rules (client-safe): `apps/web/lib/generation/recommend.ts`.

## Quality Lock checklist

1. Mark In/Out ≤ 12s (Phase 1 hard max). Short Cut scenes are auto-expanded to the provider input floor (Seedance ≥4s) within the parent media — if the whole file is shorter, the job fails with a clear error.
2. Prompt describes **only the change**; system adds preserve clauses (camera, lighting, background, people).
3. Attach 1–2 reference images of the target subject when identity matters (e.g. Ford Escort).
4. Review draft A/B against source before approve.
5. Keep source audio unless the edit requires new sync sound.
6. Promote → auto light analysis (best-effort) → optional Cut insert; brand check remains manual (no synthetic pass).

## Provider floors (staging note)

OpenRouter Seedance r2v rejects input clips under ~1.8s (`InvalidParameter` on `content[1]`). Worker uses `expandEditRangeForProvider` (`apps/web/lib/generation/expand-edit-range.ts`) before ffmpeg slice + submit.

For Seedance **edit** tasks omit `duration` on the OpenRouter request (output follows the input video, which must be 4–30s). Fixed durations are for create/extend only. Do **not** send `duration: -1` — OpenRouter’s public schema rejects it (`ZodError` ≥1) even though ByteDance’s native API uses -1.

## Env

| Key | Role |
|-----|------|
| `OPENROUTER_API_KEY` | Shared with vision — required for generation |
| `OPENROUTER_API_BASE_URL` | Default `https://openrouter.ai/api/v1` |
| `VIDEON_GENERATION_MAX_EDIT_MS` | Override max range (default 12000) |
| `VIDEON_GENERATION_MAX_CONCURRENT` | Per-workspace concurrent jobs (default 2) |
| `VIDEON_GENERATION_SEEDANCE_MODEL` | Default `bytedance/seedance-2.5` |
| `VIDEON_GENERATION_DRAFT_MODEL` | Optional draft slug override |
| `VIDEON_GENERATION_VEO_MODEL` | Default `google/veo-3.1` |
| `VIDEON_GENERATION_VEO_LITE_MODEL` | Default `google/veo-3.1-lite` |
| `VIDEON_GENERATION_WAN_MODEL` | Default `alibaba/wan-3.0` |
| `VIDEON_GENERATION_MINIMAX_MODEL` | Default `minimax/hailuo-3-max` (create) |
| `VIDEON_GENERATION_MINIMAX_EDIT_MODEL` | Default `minimax/hailuo-3` (edit) |
| `VIDEON_GENERATION_ALEPH_MODEL` | When set, enables Aleph in catalog |

Video generation is **not ZDR-eligible** — do not send `zdr` on `/videos`. See staging notes.

Documented also in `knowledge/paths.md`. Staging: `knowledge/staging-coolify-fal-generation.md` (filename legacy; content is OpenRouter).

## Surfaces

- Media editor: AI Edit + job list / A/B / approve · optional insert into active Cut
- Cut editor: AI Edit on active clip (source range clamped to max) · status strip · auto-insert via `target_cut_id`
- Mediathek: New AI clip (create)
- Cut jobs API: `GET /api/cuts/:cutId/generate-jobs`

## Storage

```
{workspaceId}/media/{parentMediaId}/derivatives/generate/{jobId}/slice.mp4
{workspaceId}/media/{parentMediaId}/derivatives/generate/{jobId}/draft.mp4
{workspaceId}/media/{parentMediaId}/derivatives/generate/{jobId}/final.mp4
{workspaceId}/media/{promotedMediaId}/source
```

## Coolify / staging

Generation on main app. Set/reuse `OPENROUTER_API_KEY` — see `knowledge/staging-coolify-fal-generation.md`.

## Create-Welle

- Mediathek: **Neuer AI-Clip** → `POST /api/media/ai-create`
- Models: Seedance 2.5 T2V/I2V, Veo 3.1
- MCP: `videon.generate_create_run` · Catalog `videon.generate.create`
- Optional Brandion active-pack style refs remain bind-paths-only (Later polish)
