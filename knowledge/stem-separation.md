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
| Env on web app | `VIDEON_STEM_SERVICE_URL` → staging FQDN (see `staging-coolify-stem-worker.md`) |

Model is loaded **once at process start** and kept in memory (`uvicorn --workers 1`).

## Methods

| Method | Quality | Where |
|--------|---------|--------|
| `demucs_htdemucs_ft_residual` | **Default:** fine-tuned Demucs bag + residual music | Stem worker |
| `demucs_htdemucs_residual` | Faster base model (`STEM_MODEL=htdemucs`) | Optional |
| `demucs_*_soft` | Wiener softmask (`STEM_SOFTMASK=1`) — often re-bleeds into A1 | Optional |
| `ffmpeg_center_band` | Approximation | Worker or local fallback script |
| `*_fallback` | Demucs failed → ffmpeg | Worker / script |

Audio I/O in the worker uses **ffmpeg + stdlib `wave`** (not `torchaudio.load` / TorchCodec). Newer torchaudio builds require TorchCodec and would otherwise force silent `_fallback`.

Demucs runs in `asyncio.to_thread` so `/health` stays up during long CPU jobs. The web client must raise Undici `headersTimeout`/`bodyTimeout` above the default ~300s (see `lib/pipeline/audio-stems.ts`) or Demucs appears as `ffmpeg_center_band_fallback` after a headers timeout.

Worker knobs (env):

| Env | Default | Notes |
|-----|---------|--------|
| `STEM_MODEL` | `htdemucs_ft` | Best quality bag; `htdemucs` = faster |
| `STEM_SHIFTS` | `1` | Extra shifts on top of ft bag (costly) |
| `STEM_OVERLAP` | `0.5` | Chunk overlap |
| `STEM_SOFTMASK` | `0` | Keep off for clean voice |

## UI

- Default: **Voice/Music (Demucs)** → requires stem worker URL in staging.
- Re-run analysis after stem worker quality changes so stems are rewritten.
- „Letzter Stem-Lauf“ should show `demucs_htdemucs_ft_residual` (not soft / ffmpeg fallback).
