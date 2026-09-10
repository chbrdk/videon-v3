# Corrupt media storage keys

**Updated:** 2026-09-10  

## Symptom

Open Cut / export fails with:

`Source media file missing in storage for <filename> … key <workspaceId>/`

That key is **corrupt**: it is only the workspace prefix, not  
`<workspaceId>/media/<mediaAssetId>/source`.

## Cause

DB `media_assets.storage_key` no longer points at an uploaded object (truncated/wrong value).  
Canonical uploads always use `mediaSourceStorageKey()`.

## Mitigation (code)

Export download tries stored key (if sane) then canonical path; heals DB when canonical exists.

## Operator fix

If heal still fails for **fin 1.mp4** (or any clip):

1. Open Collection → Mediathek  
2. Re-upload the file (or delete + upload)  
3. Replace the broken clip in the Cut with the new media  
4. **Premiere aktualisieren** again  
