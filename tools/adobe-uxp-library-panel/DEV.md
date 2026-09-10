# Host-free development (no UXP Developer Tool / Premiere)

## Browser preview

```bash
cd tools/adobe-uxp-library-panel
npx --yes serve -p 4173
```

Open `http://localhost:4173/preview.html`

1. Einstellungen → Staging base URL + Settings API token (`videon_…`)
2. **Collections laden**
3. Suchen → Treffer + Poster
4. **Download prüfen** (ohne Premiere-Import) — schreibt in den Browser-Shim-Cache
5. Settings → **Cache aktualisieren / leeren**

`import('uxp')` / `import('premierepro')` werden über Import Maps auf Browser-Shims gemappt.

## API smoke (curl)

```bash
export VIDEON_URL=https://videon.projects-a.plygrnd.tech
export VIDEON_TOKEN=videon_…   # Settings token

curl -sS -H "Authorization: Bearer $VIDEON_TOKEN" "$VIDEON_URL/api/health"

curl -sS -H "Authorization: Bearer $VIDEON_TOKEN" "$VIDEON_URL/api/collections" | head

curl -sS -H "Authorization: Bearer $VIDEON_TOKEN" \
  "$VIDEON_URL/api/media/search?q=intro&limit=5"

# After picking mediaAssetId + platformProjectId from a hit:
curl -sS -H "Authorization: Bearer $VIDEON_TOKEN" \
  "$VIDEON_URL/api/media/MEDIA_ID/adobe-download?platformProjectId=PROJECT_ID&kind=source&mode=json"
```

`kind=proxy` must return `409` `proxy_unavailable` until proxies exist.

## Unit tests (repo)

```bash
cd apps/web
npx vitest run __tests__/adobe-uxp-library-panel.test.ts
```
