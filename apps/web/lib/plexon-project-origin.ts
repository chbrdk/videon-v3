import { PLEXON_FEDERATION_CONTRACT_VERSION, PLEXON_CONTRACT_VERSION_HEADER, PLEXON_SERVICE_SECRET_HEADER } from '@videon-v3/contracts'
import { federationMode, plexonBaseUrl, plexonServiceSecret } from './runtime-config'

export type VideonProjectOriginInput = {
  videonWorkspaceId: string
  name: string
  domain?: string | null
  platformCompanyId: string
  ownerPlexonUserId: string
}

export type VideonProjectOriginResult = {
  platformProjectId: string
  binding: { productId: 'videon'; externalProjectId: string; syncStatus: string }
  siblingSync: { accepted: boolean }
}

/**
 * Called only after VIDEON created a valid local workspace and a user explicitly starts a product-first flow.
 * It remains inert in dummy mode and never constructs a PLEXON base URL itself.
 */
export async function registerVideonProjectOrigin(
  input: VideonProjectOriginInput,
): Promise<VideonProjectOriginResult | null> {
  if (federationMode() !== 'live') return null
  const base = plexonBaseUrl()
  const secret = plexonServiceSecret()
  if (!base || !secret) return null

  const response = await fetch(`${base}/api/platform/provisioning/videon-project-origin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
      [PLEXON_SERVICE_SECRET_HEADER]: secret,
    },
    body: JSON.stringify(input),
  })
  if (!response.ok) return null
  const body = (await response.json()) as Partial<VideonProjectOriginResult>
  if (!body.platformProjectId || !body.binding || !body.siblingSync) return null
  return body as VideonProjectOriginResult
}
