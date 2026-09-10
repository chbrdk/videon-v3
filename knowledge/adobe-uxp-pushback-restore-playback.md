# Pushback restore → no playback / empty A1

**Updated:** 2026-09-10  
**Panel:** ≥ **0.1.25**

## Symptom

After **Cut aktualisieren → Übernehmen**, Videon shows an updated timeline but:
- video playback fails / black
- A1/A2 look empty

## Causes (ranked)

1. **Filename collision:** Mediathek had another `fin 1.mp4` (old corrupt key). Pushback mapped Premiere clips to that stale UUID. Timeline rewrites, stream 404s. Fixed: Cut media wins over Mediathek duplicates (`mergePushbackMediaCatalog`).
2. **Bad source window:** Premiere `in`/`out` = `-1` needs `pproTicks*`; wrong fps → seek past duration. Fixed: ticks fallback + clipitem rate.
3. **A1 UX:** Source audio lanes hide when peaks are missing (looks like “no tracks”). Fixed: empty-peak placeholder clip.
4. Restore now **rejects** media whose source object is missing in storage.

## Operator recovery (already-broken Cut)

1. Replace timeline clips with the **current** Mediathek files (drag again).  
2. Panel **v0.1.25+** → edit in Premiere → **Übernehmen** again.  
3. Soft-archive duplicate same-name assets in Mediathek if possible.
