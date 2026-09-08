# Coolify — reframe worker (Robust saliency + smooth crop)

**Project:** VIDEON  
**Companion:** `specs/domain/media-reframe.md`

| Item | Value |
|------|--------|
| App | `videon-v3:reframe-worker` |
| Server | projects-01 |
| Dockerfile | `/services/reframe-worker/Dockerfile` |
| Port | **8092** |
| Health | `GET /health` → `{ ok, service, saliencyModel: robust_v1 }` |
| Reframe | `POST /v1/reframe` multipart `file` + `aspectRatio` + `smoothingFactor` |

## Wire main app

```
VIDEON_REFRAME_SERVICE_URL=https://<reframe-worker-fqdn>
```

Redeploy main-app after setting the env. UUID/FQDN recorded after Coolify create.

## Verify

```
curl -s "$VIDEON_REFRAME_SERVICE_URL/health"
```
