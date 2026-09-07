# Stem worker service (persistent Demucs)

**Status:** Accepted — 2026-09-07 (staging: `htdemucs`, ffmpeg fallback off)  
**Implements:** `services/stem-worker/` · client `apps/web/lib/pipeline/audio-stems.ts`  
**Companion:** `knowledge/stem-separation.md`

## Problem

Spawning `python3 -m demucs` per analysis job reloads weights every time (minutes of cold start). Product requires a **warm, always-on** stem service.

## Service

| Item | Value |
|------|--------|
| Process | Long-running HTTP (uvicorn) |
| Port | `8091` |
| Health | `GET /health` → `{ ok, modelLoaded, device, model, ffmpegFallback }` |
| Separate | `POST /v1/separate` multipart `file` + `method` (`demucs` \| `ffmpeg_mid_side`) |
| Response | multipart: `meta` (JSON) + `voice` WAV + `music` WAV |
| Model | `STEM_MODEL` (default **`htdemucs`**) loaded **once at startup**, kept in memory; inference on `cpu` |
| Coolify | Dedicated always-on application in project VIDEON (not scaled to zero) |

## Quality (Voice / Music)

1. WHEN method is Demucs AND softmask is off (default) THEN Voice MUST be the raw Demucs `vocals` stem and Music MUST be `mix − vocals` (residual). Softmask MUST NOT be the default — it re-partitions the mix and often bleeds music into Voice.
2. WHEN Demucs runs THEN the worker MUST use `STEM_MODEL` (staging default **`htdemucs`** for CPU latency). Operators MAY set `STEM_MODEL=htdemucs_ft` for higher quality when GPU/time allows.
3. WHERE extra isolation is needed THEN `STEM_SHIFTS ≥ 1` MAY be raised; default SHOULD stay `1`.
4. WHEN `STEM_FFMPEG_FALLBACK=0` (staging default) AND Demucs fails THEN the worker MUST return HTTP 500 — it MUST NOT write `ffmpeg_*_fallback` stems. Explicit `method=ffmpeg_mid_side` remains available for intentional approximation runs.

## Client (VIDEON web/worker)

1. WHEN `VIDEON_STEM_SERVICE_URL` is set THEN stem separation MUST call the stem worker (not a one-shot Demucs subprocess).
2. WHEN method is `demucs` AND the stem service fails THEN the client MUST NOT fall back to local ffmpeg (no fake Voice track).
3. Main web image MUST NOT ship Torch/Demucs (keeps app deploys lean). Stem worker image owns the neural stack.

## Acceptance

1. Stem worker process stays up; `/health` reports `modelLoaded: true` without per-request reload.
2. Analysis with Demucs capability records `demucs_htdemucs_residual` (or `demucs_<model>_residual` / soft variant when opted in) — not silent ffmpeg fallback while `STEM_FFMPEG_FALLBACK=0`.
3. Paths/env documented in `knowledge/paths.md` / `.env.example`.
