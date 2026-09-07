# Stem separation (Voice / Music)

**Status:** Living — 2026-09-07  
**Implements:** `scripts/separate-audio-stems.py` · `lib/pipeline/audio-stems.ts`

## Product expectation

A1 = **Voice**, A2 = **Music**. Hearing the full mix on A1 is a bug for product language.

## Methods

| Method (stored on `media_audio_stems.method`) | Quality | Notes |
|-----------------------------------------------|---------|-------|
| `demucs_htdemucs` | Real vocals / no_vocals | Needs `demucs` in the runtime image |
| `ffmpeg_center_band` | Approximation | Speech-band mid → voice; bass + air + side → music |
| `ffmpeg_mid_side` / `*_fallback` | Legacy | Raw mid = mix-ish; do not treat as true Voice |
| `mono_passthrough` | N/A | Source has one channel; music stem is silence |

## UI

- Media Editor overflow: **Neural (Demucs)** vs **Näherung (Center-Band)**.
- Default pick is Demucs; if Demucs is missing, analysis falls back and records `ffmpeg_center_band_fallback` (or similar).
- After changing method, **re-run analysis** so stems are rewritten in object storage.

## Ops

Optional image install (large): `pip3 install --break-system-packages demucs` (see `Dockerfile` comment / `.env.example`).
