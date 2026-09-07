# Stem separation (Voice / Music)

**Status:** Living — 2026-09-07  
**Implements:** `services/stem-worker/` · `scripts/separate-audio-stems.py` · `lib/pipeline/audio-stems.ts`  
**Spec:** `specs/domain/stem-service.md`

## Product expectation

A1 = **Voice**, A2 = **Music**. Hearing the full mix on A1 is a bug for product language.

## Always-on stem worker

Demucs must **not** cold-load per analysis job.

| Item | Value |
|------|--------|
| Coolify app | `videon-v3:stem-worker` (always running, never scale-to-zero) |
| Dockerfile | `services/stem-worker/Dockerfile` |
| Port | `8091` |
| Health | `GET /health` → `modelLoaded: true` |
| Separate | `POST /v1/separate` |
| Env on web app | `VIDEON_STEM_SERVICE_URL=http://<stem-worker-internal>:8091` |

Model `htdemucs` is loaded **once at process start** and kept in memory (`uvicorn --workers 1`).

## Methods

| Method | Quality | Where |
|--------|---------|--------|
| `demucs_htdemucs_soft` | Demucs + Wiener softmask (complementary stems, less crosstalk) | Stem worker (default) |
| `demucs_htdemucs` | Demucs only (`STEM_SOFTMASK=0`) | Stem worker |
| `ffmpeg_center_band` | Approximation | Worker or local fallback script |
| `*_fallback` | Demucs failed → ffmpeg | Worker / script |

Worker knobs (env): `STEM_SHIFTS` (default `1`), `STEM_OVERLAP` (default `0.5`), `STEM_SOFTMASK` (default `1`).

## UI

- Default: **Voice/Music (Demucs)** → requires stem worker URL in staging.
- Re-run analysis after stem worker quality changes so stems are rewritten.
- „Letzter Stem-Lauf“ should show `demucs_htdemucs_soft` (not `ffmpeg…_fallback`).
