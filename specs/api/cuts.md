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

`addScene`, `split`, `merge`, `delete`, `trim`, `rollTrim`, `restore`, rename, …

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

### New: `setCanvas`

```json
{
  "action": "setCanvas",
  "aspectPreset": "9:16"
}
```

| Field | Notes |
|-------|-------|
| `aspectPreset` | `9:16` \| `16:9` \| `1:1` \| `custom` |
| `width` / `height` | Required when `custom`; even integers 2–3840 |

Returns `{ cut }` with updated `width`/`height`. Spec: `cut-export-extras.md`.

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
