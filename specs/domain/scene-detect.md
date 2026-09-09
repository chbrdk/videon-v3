# Scene detection

**Status:** Active  
**Product:** VIDEON v3  
**Companion:** PLEXON `videon-integration.md` (stage graph), `analysis-capabilities.md`

## Purpose

`scene_detect` finds temporal cut points so later stages (`frame_sample`, `vision`, Cut) work on **shot-level** windows, not coarse 30s chunks.

## Algorithm

1. ffmpeg `select='gt(scene,<threshold>)'` + `showinfo` on the local source file.
2. Parse `pts_time` cut points; always include `0` and the probe duration as bounds.
3. Normalize into non-overlapping scenes that **abut** (end of N = start of N+1).
4. Split any scene longer than `MAX_SCENE_MS` for vision sampling bounds.
5. On ffmpeg failure, fall back to fixed `MAX_SCENE_MS` windows (`detectScenes`).

## Versioned parameters (`videon.pipeline.v2`)

| Constant | Value | Rationale |
|----------|-------|-----------|
| `SCENE_THRESHOLD` | `0.22` | Sensitive enough for montage / soft cuts; lower = more cuts |
| `MIN_SCENE_MS` | `400` | Keep rapid cuts; drop only micro-flicker |
| `MAX_SCENE_MS` | `30_000` | Cap vision window size for long unbroken takes |

## Guarantees

1. WHEN cut points abut (gap = 0) THEN normalize MUST **not** merge them into one scene.
2. WHEN a scene is shorter than `MIN_SCENE_MS` THEN it MAY be absorbed into the previous scene.
3. WHEN two boundaries overlap THEN the later start MUST be absorbed into the earlier end.
4. WHEN ffmpeg finds no cuts THEN the asset is one scene (then split only by `MAX_SCENE_MS`).
5. WHEN pipeline parameters change THEN `PIPELINE_VERSION` MUST bump so analysis fingerprints invalidate prior scene sets.

## Non-goals

- PySceneDetect / ContentDetector is not required for v3; ffmpeg scene score is the current engine.
- Adaptive per-asset thresholds are out of scope until operators need a control.
