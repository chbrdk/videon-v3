# Coolify — reframe worker (Robust saliency + smooth crop)

**Project:** VIDEON  
**Companion:** `specs/domain/media-reframe.md`

| Item | Value |
|------|--------|
| App | `videon-v3:reframe-worker` |
| UUID | `hydwudxhs3ovqdf3lpdk9gjz` |
| Server | projects-01 |
| Dockerfile | `/services/reframe-worker/Dockerfile` |
| Port | **8092** |
| Public FQDN | `https://hydwudxhs3ovqdf3lpdk9gjz.projects-a.plygrnd.tech` |
| Health | `GET /health` → `{ ok, service, saliencyModel: robust_v1 }` |
| Reframe | `POST /v1/reframe` multipart `file` + `aspectRatio` + `smoothingFactor` |

Created via Coolify REST `POST /applications/private-github-app` (same token as MCP). Keep always-on (no scale-to-zero). Default saliency is Robust/OpenCV CPU — not SAM.

## Wire main app

On `videon-v3:main-app` (`mi0j3pyjrel80jodebwvhgvi`):

```
VIDEON_REFRAME_SERVICE_URL=https://hydwudxhs3ovqdf3lpdk9gjz.projects-a.plygrnd.tech
```

Already set via `PATCH …/envs/bulk`. Redeploy main after changes.

## Verify

```
curl -s https://hydwudxhs3ovqdf3lpdk9gjz.projects-a.plygrnd.tech/health
# {"ok":true,"service":"videon-reframe-worker","saliencyModel":"robust_v1",...}
```

Then start a 9:16 reframe from Media Editor overflow or MCP `videon.reframe_run`.
