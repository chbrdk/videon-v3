# Cuts API (multi-source compose)

**Status:** Accepted — 2026-09-08  
**Domain:** `specs/domain/cut-multi-source-compose.md`  
**Auth:** Session or service (`X-Service-Secret` + `X-Plexon-User-Id`); Access Model B + `platformProjectId`

## `POST /api/cuts`

Create a Cut.

### Body

| Field | Required | Notes |
|-------|----------|-------|
| `platformProjectId` | yes | Collection |
| `name` | yes | Display name |
| `mediaAssetId` | conditional | Single-clip create when `scenes` omitted |
| `startMs` / `endMs` | no | Single-clip range (default 0…duration) |
| `scenes` | conditional | Array of clip specs (preferred for multi-source) |

### `scenes[]` entry

| Field | Required | Notes |
|-------|----------|-------|
| `mediaAssetId` | yes | Workspace media |
| `startMs` / `endMs` | conditional | Required unless resolvable via `sceneKey` |
| `sceneKey` | no | Resolve times from latest succeeded analysis `scene_insights` when times omitted |

### Responses

- `201` `{ cut, scenes }` — scenes include optional `sceneKey`
- `400` `invalid_payload` — missing media/range
- `403` / `404` — access / media not in workspace

## `PATCH /api/cuts/:cutId?platformProjectId=`

### Existing actions

`addScene`, `split`, `merge`, `delete`, `trim`, `rollTrim`, `restore`, `reorder`, rename, …

### New: `moveScene` (free arrange)

```json
{
  "action": "moveScene",
  "sceneId": "<id>",
  "timelineStartMs": 12000
}
```

- Sets `cut_scenes.timeline_start_ms` (≥ 0). Gaps and overlaps allowed.
- `trim` MAY also send `timelineStartMs` when the start edge is resized (anchor right edge).
- Returns `{ scenes }` with `timelineStartMs` on each scene.

### New: `moveClips` (batch + optional ripple)

```json
{
  "action": "moveClips",
  "ripple": false,
  "moves": [
    { "lane": "v1", "id": "<sceneId>", "timelineStartMs": 12000 },
    { "lane": "v2", "id": "<videoClipId>", "timelineStartMs": 8000 },
    { "lane": "audio", "id": "<audioClipId>", "timelineStartMs": 4000 }
  ]
}
```

- Applies all moves in **one** DB transaction. `timelineStartMs` MUST be ≥ 0.
- WHEN `ripple` is true THEN for each moved clip the server MUST also shift later same-lane clips by the same Δt as that clip (primary moves listed explicitly; client SHOULD expand ripple into the `moves` array for determinism — server MAY re-apply per-lane delta from each primary).
- Returns `{ scenes, videoClips, audioClips }` (full lists for touched lanes).

### New: `addScenes`

```json
{
  "action": "addScenes",
  "afterSceneId": "<optional>",
  "scenes": [
    { "mediaAssetId": "…", "startMs": 0, "endMs": 5000, "sceneKey": "s1" }
  ]
}
```

- All media must belong to the Cut workspace.
- Inserted in array order after `afterSceneId` (or at end).
- Returns `{ scenes }` full ordered timeline.

### New: audio bus + V2 overlay (`cut-multi-track.md`)

| Action | Body | Result |
|--------|------|--------|
| `addAudioClip` | `mediaAssetId`, `startMs`, `endMs`, optional `timelineStartMs`, `trackId` | `{ tracks, audioClips }` |
| `trimAudioClip` | `audioClipId`, `startMs`?, `endMs`?, optional `timelineStartMs` | `{ audioClips }` |
| `moveAudioClip` | `audioClipId`, `timelineStartMs` | `{ audioClips }` |
| `deleteAudioClip` | `audioClipId` | `{ audioClips }` |
| `addVideoClip` | `mediaAssetId`, `startMs`, `endMs`, optional `timelineStartMs`, `trackId` | `{ tracks, videoClips }` |
| `trimVideoClip` | `videoClipId`, `startMs`?, `endMs`?, optional `timelineStartMs` | `{ videoClips }` |
| `moveVideoClip` | `videoClipId`, `timelineStartMs` | `{ videoClips }` |
| `deleteVideoClip` | `videoClipId` | `{ videoClips }` |
| `moveClipLane` | `fromLane` (`v1`\|`v2`), `toLane` (`v1`\|`v2`), `clipId`, optional `timelineStartMs` | `{ scenes, videoClips }` |
| `setTrackMuted` | `trackId`, `muted` | `{ tracks }` |

#### `moveClipLane` (V1 ↔ V2)

Moves a clip between the main V1 track (`cut_scenes`) and the V2 overlay (`cut_video_clips`). Media + in/out are preserved; `timelineStartMs` MAY update the free-arrange start.

- `fromLane: "v1"`, `toLane: "v2"`: `clipId` is a scene id. Fails if fewer than two V1 scenes would remain.
- `fromLane: "v2"`, `toLane: "v1"`: `clipId` is a video clip id.

`GET /api/cuts/:id` includes `tracks`, `audioClips`, and `videoClips` (empty arrays when none).

### Waveform peaks on Cut detail

`stems[mediaAssetId]` MAY include:

| Field | Notes |
|-------|--------|
| `voicePeaks` / `musicPeaks` | From `media_audio_stems` when Demucs (or intentional stem run) produced them |
| `mixPeaks` | From `media_waveform_peaks` after audio extract (upload default path) |
| `voice` / `music` | Presence flags for stem WAVs |
| `method` | Stem method label when stems exist |

Client A1 prefers `voicePeaks`, then `mixPeaks`, then deferred stream decode. A2 uses `musicPeaks` only.

## Exports

### `POST /api/cuts/:cutId/exports?platformProjectId=`

Body: `{ "format"?: "mp4" | "premiere_xml", "idempotencyKey"?: string }` — default `mp4`.  
`premiere_xml` stores a **ZIP** (XMEML + `media/` sources), not bare XML.  
Response `202` `{ export }`.

### `GET /api/cuts/:cutId/exports/:exportId`

Returns `{ export, downloadUrl? }`. Download filename `.mp4` or `.zip` by format; MIME `video/mp4` or `application/zip`.

## Errors

| Code | When |
|------|------|
| `invalid_payload` | Empty batch, bad ranges, unknown sceneKey without times, bad canvas/format |
| `not_found` | Cut or media missing |
| `collection_access_denied` | Access Model B |
| `dependency_unavailable` | DB down |
