import {
  PLEXON_FEDERATION_CONTRACT_VERSION,
  parseProvisionWorkspaceRequest,
  relativeWorkspaceLinks,
} from '@videon-v3/contracts'
import { apiError, apiJson } from '@/lib/api-response'
import { authorizeFederationRequest, plexonUserId } from '@/lib/federation'
import { canReadWorkspace, findWorkspace, upsertWorkspace } from '@/lib/db/workspaces'
import { hasDatabaseConfig } from '@/lib/db/client'

type RouteContext = { params: Promise<{ platformProjectId: string }> }

function authorizationError(request: Request, code: 'contract_version_mismatch' | 'service_unauthorized' | 'dependency_unavailable') {
  const status = code === 'contract_version_mismatch' ? 409 : code === 'dependency_unavailable' ? 503 : 401
  return apiError(request, status, code, 'Federation authorization failed', {
    retryable: code === 'dependency_unavailable',
  })
}

export async function PUT(request: Request, context: RouteContext) {
  const authorization = authorizeFederationRequest(request)
  if (!authorization.ok) return authorizationError(request, authorization.code)
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', { retryable: true })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(request, 400, 'invalid_payload', 'JSON body required')
  }

  const parsed = parseProvisionWorkspaceRequest(body)
  if (!parsed.ok) {
    return apiError(request, 422, 'invalid_payload', 'Invalid provisioning payload', {
      details: { issues: parsed.issues },
    })
  }

  const { platformProjectId } = await context.params
  if (platformProjectId.trim() !== parsed.value.platformProjectId) {
    return apiError(request, 422, 'invalid_payload', 'Path and platformProjectId must match')
  }

  try {
    const result = await upsertWorkspace(parsed.value)
    return apiJson(
      request,
      {
        project: result.workspace,
        externalProjectId: result.workspace.id,
        created: result.created,
        contractVersion: PLEXON_FEDERATION_CONTRACT_VERSION,
      },
      result.created ? 201 : 200,
    )
  } catch {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', { retryable: true })
  }
}

export async function GET(request: Request, context: RouteContext) {
  const authorization = authorizeFederationRequest(request)
  if (!authorization.ok) return authorizationError(request, authorization.code)
  if (!hasDatabaseConfig()) {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', { retryable: true })
  }

  const requester = plexonUserId(request)
  if (!requester) return apiError(request, 400, 'user_context_required', 'X-Plexon-User-Id is required')

  const { platformProjectId } = await context.params
  try {
    const workspace = await findWorkspace(platformProjectId.trim())
    if (!workspace) return apiError(request, 404, 'not_found', 'VIDEON workspace not found')
    if (!(await canReadWorkspace(workspace, requester))) {
      return apiError(request, 403, 'collection_access_denied', 'The user cannot access this Collection')
    }

    return apiJson(request, {
      project: {
        id: workspace.id,
        platformProjectId: workspace.platformProjectId,
        name: workspace.name,
        status: workspace.status,
      },
      summary: {
        mediaCount: 0,
        readyMediaCount: 0,
        processingMediaCount: 0,
        failedMediaCount: 0,
        cutCount: 0,
        lastActivityAt: null,
      },
      links: relativeWorkspaceLinks(workspace.platformProjectId),
      contractVersion: PLEXON_FEDERATION_CONTRACT_VERSION,
    })
  } catch {
    return apiError(request, 503, 'dependency_unavailable', 'Workspace persistence is unavailable', { retryable: true })
  }
}
