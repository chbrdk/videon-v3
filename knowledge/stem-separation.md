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
| `demucs_htdemucs_residual` | **Staging default:** faster Demucs + residual music | Stem worker |
| `demucs_htdemucs_ft_residual` | Fine-tuned bag (`STEM_MODEL=htdemucs_ft`) | Optional quality lane |
| `demucs_*_soft` | Wiener softmask (`STEM_SOFTMASK=1`) — often re-bleeds into A1 | Optional |
| `ffmpeg_center_band` | Approximation (explicit method only) | Worker when requested |
| `*_fallback` | Demucs failed → ffmpeg | **Off** while `STEM_FFMPEG_FALLBACK=0` |

Audio I/O in the worker uses **ffmpeg + stdlib `wave`** (not `torchaudio.load` / TorchCodec). Newer torchaudio builds require TorchCodec and would otherwise force silent `_fallback`.

Demucs runs in `asyncio.to_thread` so `/health` stays up during long CPU jobs. The web client must raise Undici `headersTimeout`/`bodyTimeout` above the default ~300s (see `lib/pipeline/audio-stems.ts`) or Demucs appears as `ffmpeg_center_band_fallback` after a headers timeout.

Multipart to the worker MUST use undici `FormData` + `File` with undici `fetch`. Mixing the global `FormData` into `undici.fetch` drops the `file` part → FastAPI `422 field required` → local ffmpeg fallback.

Analysis MUST upload the **extracted audio track** to `/v1/separate` (not the full video container) — see `run-analysis.ts` audio stage.

Worker knobs (env):

| Env | Default | Notes |
|-----|---------|--------|
| `STEM_MODEL` | `htdemucs` | Faster CPU default; `htdemucs_ft` = quality |
| `STEM_SHIFTS` | `1` | Extra shifts (costly) |
| `STEM_OVERLAP` | `0.5` | Chunk overlap |
| `STEM_SOFTMASK` | `0` | Keep off for clean A1 |
| `STEM_FFMPEG_FALLBACK` | `0` | Temporary: demucs errors fail hard (no fake Voice) |

## UI

- Default: **Voice/Music (Demucs)** → requires stem worker URL in staging.
- Re-run analysis after stem worker quality changes so stems are rewritten.
- „Letzter Stem-Lauf“ should show `demucs_htdemucs_residual` (not soft / ffmpeg fallback) while staging uses `STEM_MODEL=htdemucs`.
