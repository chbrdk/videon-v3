# Media peaks backfill

**Status:** Accepted — Wave 4  
**Route:** `POST /api/media/:mediaAssetId/peaks-backfill?platformProjectId=`  
**Domain:** `specs/domain/cut-editor-load-performance.md`  
**Auth:** Access Model B (session / service secret)

## Purpose

Compute and persist `mixPeaks` for media that was analyzed before Wave 3 storage, without re-running vision/Demucs.

## Behaviour

1. WHEN Model B fails THEN fail closed.  
2. WHEN `mixPeaks` already exist THEN return `200` `{ status: "ready", skipped: true }`.  
3. WHEN audio can be extracted THEN write `media_waveform_peaks` and return `200` `{ status: "ready" }`.  
4. WHEN no audio track THEN `200` `{ status: "skipped", reason: "no_audio" }`.  
5. WHEN storage/ffmpeg fails THEN `503` retryable.

Clients MAY call this idle/deferred (concurrency ≤ 1) after Cut open for timeline media missing `mixPeaks`.
