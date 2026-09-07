# Coolify — stem worker (always-on Demucs)

**Project:** VIDEON  
**Companion:** `specs/domain/stem-service.md`

| Item | Value |
|------|--------|
| App | `videon-v3:stem-worker` |
| UUID | `nodc0dxwwwnpjc2uvk0snrff` |
| Server | projects-01 |
| Dockerfile | `/services/stem-worker/Dockerfile` |
| Port | **8091** |
| Public FQDN | `https://nodc0dxwwwnpjc2uvk0snrff.projects-a.plygrnd.tech` (health only; app uses private URL) |
| Service URL (staging) | `https://nodc0dxwwwnpjc2uvk0snrff.projects-a.plygrnd.tech` (FQDN — UUID-Hostname resolved on Coolify-Netz nicht) |

Created via Coolify REST `POST /applications/private-github-app` (same token as MCP). Build is large (CPU Torch + htdemucs) — first deploy can take a long time. Keep always-on (no scale-to-zero).

## Wire main app

On `videon-v3:main-app` (`mi0j3pyjrel80jodebwvhgvi`):

```
VIDEON_STEM_SERVICE_URL=https://nodc0dxwwwnpjc2uvk0snrff.projects-a.plygrnd.tech
```

Already set via `PATCH …/envs/bulk`. Redeploy main after changes.

## Verify

```
curl -s https://nodc0dxwwwnpjc2uvk0snrff.projects-a.plygrnd.tech/health
# {"ok":true,"modelLoaded":true,"model":"htdemucs",...}
```

Then re-run media analysis with Stem method **Voice/Music (Demucs)**.  
„Letzter Stem-Lauf“ should show `demucs_htdemucs` (not `ffmpeg…_fallback`).
