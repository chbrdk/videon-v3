# API — Media Adobe download

**Status:** Accepted — 2026-09-10  
**Domain:** `specs/domain/adobe-uxp-library-panel.md`  
**Auth:** Session cookie **or** Settings API Bearer (`videon_…`) **or** service secret + `X-Plexon-User-Id` — then Access Model B  
**Companion:** `playback` / `stream` (inline browser play) · `media-reframe` download (derivative attachment)

## Purpose

Issue a **short-lived, workspace-scoped** download for the Adobe UXP Library Panel so the host can cache bytes locally and import footage. Search / MCP payloads MUST NOT embed these URLs.

This is not browser playback (`/playback`, `/stream` stay `inline`). Adobe insert needs `attachment` semantics and an explicit **quality kind**.

## `GET /api/media/:mediaAssetId/adobe-download`

### Query

| Param | Required | Notes |
|-------|----------|--------|
| `platformProjectId` | Yes | Collection / workspace scope |
| `kind` | No | `source` (default, Wave 1) \| `proxy` (reserved) |
| `mode` | No | `json` (default for panels) \| `redirect` |

### `kind` semantics

| Value | Wave 1 | Behavior |
|-------|--------|----------|
| `source` | **Required** | Original uploaded object (`media.storageKey`) |
| `proxy` | Reserved | Prefer edit/proxy derivative when one exists. Until proxies ship: **`409`** `proxy_unavailable` (not silent fallback to source). Clients that want auto-fallback MUST request `source` explicitly. |

### `mode=json` (default)

**`200`:**

```json
{
  "mediaAssetId": "uuid",
  "platformProjectId": "uuid",
  "kind": "source",
  "filename": "clip.mp4",
  "mimeType": "video/mp4",
  "bytes": 12345678,
  "checksumSha256": "hex",
  "downloadUrl": "https://…signed…",
  "expiresAt": "2026-09-10T12:34:56.000Z",
  "cacheKey": "uuid:source:hex"
}
```

- `downloadUrl` is short-lived (same TTL band as other signed downloads, ~15 minutes).  
- `cacheKey` is stable for panel local cache: `{mediaAssetId}:{kind}:{checksumSha256}`.  
- **Never** return this object from search, MCP, or list endpoints.

### `mode=redirect`

**`302`** to the signed URL with `Content-Disposition: attachment`. Prefer `json` inside UXP so the panel can persist `cacheKey` / `expiresAt` before fetching bytes.

### Errors

| Status | Code | When |
|--------|------|------|
| `401` | `service_unauthorized` | No auth |
| `400` | `invalid_payload` | Missing `platformProjectId` / bad `kind` / bad `mode` |
| `403` | `collection_access_denied` | Model B deny |
| `404` | `not_found` | Unknown media / wrong Collection |
| `409` | `invalid_payload` | Lifecycle still `uploading` |
| `409` | `proxy_unavailable` | `kind=proxy` and no proxy object yet |
| `503` | `dependency_unavailable` | DB / object storage |

Archived media: follow existing media-access rules (fail closed for insert downloads if archive is read-only for new derivatives — Wave 1: allow download of existing source if product read access remains).

## Guarantees

1. WHEN auth succeeds THEN the handler MUST resolve media via `resolveMediaInWorkspace` (no client-supplied storage keys).  
2. WHEN issuing a signed URL THEN the key MUST stay under the workspace prefix (same assert as other downloads).  
3. WHEN `kind=source` THEN disposition MUST be suitable for file save (`attachment`).  
4. WHEN search or MCP returns hits THEN they MUST NOT include `downloadUrl` / signed object URLs.  
5. Paths only via `paths.routes.apiMediaAdobeDownload` in `apps/web/lib/paths.ts`.

## Acceptance

1. Contract test: path helper + this spec mention `adobe-download`.  
2. Bearer Settings token can obtain `mode=json` for a media the owner can read.  
3. Foreign Collection → `403`/`404`.  
4. `kind=proxy` → `409` `proxy_unavailable` until proxy objects exist.  
5. Staging smoke: panel (or curl) downloads source and imports into Premiere Bin.
