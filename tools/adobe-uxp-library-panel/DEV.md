# Host-free development (no UXP Developer Tool / Premiere)

## Build for Premiere (required)

Adobe UXP does **not** support `<script type="module">`. Always ship the IIFE bundle:

```bash
cd tools/adobe-uxp-library-panel
npm install
npm run build   # → src/panel.bundle.js
```

Reload the plugin in UDT (or re-sync the External sideload folder) after every build.

**UXP path quirk:** `main` is `src/index.html`, but CSS/JS hrefs resolve from the **plugin root**. Use `src/styles.css` and `src/panel.bundle.js` (not bare `styles.css`).

Panel JS MUST poll for DOM nodes via `setTimeout` — never `document.addEventListener`. Never call element `addEventListener` either (UXP domjs throws); use `on*` properties + optional HTML `onclick="videonPanel…"`.

## Browser preview

```bash
cd tools/adobe-uxp-library-panel
npx --yes serve -p 4173
```

Open `http://localhost:4173/preview.html`

Preview still loads ESM sources via import maps (not the UXP bundle).

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
