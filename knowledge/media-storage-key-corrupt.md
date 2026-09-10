# Corrupt / stale media vs Open Cut

**Updated:** 2026-09-10  

## Symptom

Open Cut fails with `Source media file missing in storage for fin 1.mp4` while Mediathek shows `fin 1.mp4` fine.

## Why that happens

Cuts store **`media_asset_id`**, not the filename. Re-upload = **new UUID**. The Cut can still point at the old row (corrupt `storage_key` like `{workspaceId}/`, no S3 source). Export labels the error with `original_filename` from that old row — so it looks like the same file.

Timeline thumbs can work from **poster** objects under `{ws}/media/{id}/posters/…` without a source file.

## Operator fix

1. In the Cut: remove clips that use the broken asset (or create a new Cut).
2. Drag the **current** Mediathek `fin 1.mp4` onto the timeline again.
3. Panel → **Premiere aktualisieren** (fresh export).

Same filename ≠ same media id. Scene `mediaAssetId` must match the working library card `id`.
