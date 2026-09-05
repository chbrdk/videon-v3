import { PLEXON_FEDERATION_CONTRACT_VERSION } from '@videon-v3/contracts'
import { apiError, apiJson } from '@/lib/api-response'
import { authorizeFederationRequest } from '@/lib/federation'
import { probeDatabase } from '@/lib/db/client'
import { pipelineQueueConfigured } from '@/lib/jobs/pg-boss-queue'
import {
  directVideoEnabled,
  federationMode,
  isLiveFederationConfigured,
  objectStorageConfig,
  openRouterApiKey,
  requiresZdr,
} from '@/lib/runtime-config'

export async function GET(request: Request) {
  const authorization = authorizeFederationRequest(request)
  if (!authorization.ok) {
    const status = authorization.code === 'contract_version_mismatch' ? 409 : authorization.code === 'dependency_unavailable' ? 503 : 401
    return apiError(request, status, authorization.code, 'Federation authorization failed', {
      retryable: authorization.code === 'dependency_unavailable',
    })
  }

  const database = await probeDatabase()
  const visionConfigured = Boolean(openRouterApiKey())
  const queueConfigured = pipelineQueueConfigured()
  const storageConfigured = Boolean(objectStorageConfig())
  const ready = database === 'ready' && (federationMode() === 'dummy' || isLiveFederationConfigured())

  return apiJson(request, {
    status: ready ? 'ready' : 'degraded',
    service: 'videon',
    contractVersion: PLEXON_FEDERATION_CONTRACT_VERSION,
    capabilities: {
      provisioning: database === 'ready',
      summary: database === 'ready',
      vision: visionConfigured,
    },
    dependencies: {
      database,
      queue: queueConfigured ? 'ready' : 'unconfigured',
      objectStorage: storageConfigured ? 'ready' : 'unconfigured',
      openrouterPreflight: visionConfigured ? 'ready' : 'unconfigured',
    },
    policy: {
      directVideoEnabled: directVideoEnabled(),
      requiresZdr: requiresZdr(),
    },
  })
}
