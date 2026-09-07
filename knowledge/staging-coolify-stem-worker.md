# Coolify — stem worker (always-on Demucs)

**Project:** VIDEON  
**Companion:** `specs/domain/stem-service.md`

## Create application

1. New Application in project **VIDEON** / same server as `videon-v3:main-app`.
2. Name: `videon-v3:stem-worker`
3. Repo: `chbrdk/videon-v3` · branch `main`
4. **Dockerfile location:** `services/stem-worker/Dockerfile`
5. Port: **8091**
6. **Do not** enable scale-to-zero / sleep.
7. Health check path: `/health` (optional HTTP check)

Build is large (CPU Torch + htdemucs weights) — first deploy can take a long time.

## Wire main app

On `videon-v3:main-app` set:

```
VIDEON_STEM_SERVICE_URL=http://<stem-worker-container-or-coolify-network-alias>:8091
```

Coolify same-project apps usually reach each other via the generated service hostname shown in the UI (or the container name). Prefer the private network URL, not a public FQDN.

Redeploy **main-app** after setting the env so analysis jobs pick up the client.

## Verify

```
curl -s http://<stem-worker>:8091/health
# {"ok":true,"modelLoaded":true,"model":"htdemucs",...}
```

Then re-run media analysis with Stem method **Voice/Music (Demucs)**.  
„Letzter Stem-Lauf“ should show `demucs_htdemucs` (not `ffmpeg…_fallback`).
