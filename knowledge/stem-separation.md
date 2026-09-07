# Stem separation (Voice / Music)

**Status:** Living — 2026-09-07  
**Implements:** `scripts/separate-audio-stems.py` · `lib/pipeline/audio-stems.ts` · runtime `Dockerfile`

## Product expectation

A1 = **Voice**, A2 = **Music**. Hearing the full mix on A1 is a bug for product language.

## Methods

| Method (stored on `media_audio_stems.method`) | Quality | Notes |
|-----------------------------------------------|---------|-------|
| `demucs_htdemucs` | Real vocals / no_vocals | **Default in staging image** (CPU torch + Demucs) |
| `ffmpeg_center_band` | Approximation | Speech-band mid → voice; bass + air + side → music |
| `ffmpeg_mid_side` / `*_fallback` | Legacy / fallback | Used only if Demucs fails or is missing |
| `mono_passthrough` | N/A | Source has one channel; music stem is silence |

## UI

- Media Editor overflow: **Voice/Music (Demucs)** vs **Näherung (Center-Band)**.
- Default pick is Demucs. After changing method, **re-run analysis** so stems are rewritten.

## Ops / image

Runtime Dockerfile installs:

1. `torch` + `torchaudio` from the **CPU** PyTorch index  
2. `demucs`  
3. Preloads `htdemucs` weights at build time  

`VIDEON_STEM_DEMUCS_ENABLED=true` is set in the image for ops clarity (gating is still “is demucs importable?”).

Expect a larger image and longer Coolify builds. Stem jobs are CPU-bound and can take many minutes on long clips.
