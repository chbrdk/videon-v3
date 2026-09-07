# Stem worker service (persistent Demucs)

**Status:** Accepted — 2026-09-07  
**Implements:** `services/stem-worker/` · client `apps/web/lib/pipeline/audio-stems.ts`  
**Companion:** `knowledge/stem-separation.md`

## Problem

Spawning `python3 -m demucs` per analysis job reloads `htdemucs` every time (minutes of cold start). Product requires a **warm, always-on** stem service.

## Service

| Item | Value |
|------|--------|
| Process | Long-running HTTP (uvicorn) |
| Port | `8091` |
| Health | `GET /health` → `{ ok, modelLoaded, device }` |
| Separate | `POST /v1/separate` multipart `file` + `method` (`demucs` \| `ffmpeg_mid_side`) |
| Response | multipart: `meta` (JSON) + `voice` WAV + `music` WAV |
| Model | `STEM_MODEL` (default `htdemucs`) loaded **once at startup**, kept in memory; inference on `cpu` |
| Coolify | Dedicated always-on application in project VIDEON (not scaled to zero) |

## Quality (Voice / Music)

1. WHEN method is Demucs AND softmask is off (default) THEN Voice MUST be the raw Demucs `vocals` stem and Music MUST be `mix − vocals` (residual). Softmask MUST NOT be the default — it re-partitions the mix and often bleeds music into Voice.
2. WHEN Demucs runs THEN the worker SHOULD use `STEM_SHIFTS ≥ 2` for better isolation (CPU cost scales with shifts).
3. WHERE operators need maximum quality THEN `STEM_MODEL=htdemucs_ft` MAY be set (slower / more RAM); default remains `htdemucs`.

## Client (VIDEON web/worker)

1. WHEN `VIDEON_STEM_SERVICE_URL` is set THEN stem separation MUST call the stem worker (not a one-shot Demucs subprocess).
2. WHEN the service is unreachable THEN the client MAY fall back to local `scripts/separate-audio-stems.py` (ffmpeg path; Demucs only if installed locally).
3. Main web image MUST NOT ship Torch/Demucs (keeps app deploys lean). Stem worker image owns the neural stack.

## Acceptance

1. Stem worker process stays up; `/health` reports `modelLoaded: true` without per-request reload.
2. Analysis with Demucs capability records `demucs_htdemucs_residual` (or `demucs_<model>_residual` / soft variant when opted in) — not silent ffmpeg fallback.
3. Paths/env documented in `knowledge/paths.md` / `.env.example`.
