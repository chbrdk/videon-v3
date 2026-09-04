import type { ProvisionedWorkspace } from '@videon-v3/contracts'
import { canReadWorkspace, findWorkspace, upsertWorkspace } from './db/workspaces'
import {
  fetchAccessibleCollections,
  requestVideonMirrorSync,
  type AccessibleCollection,
} from './plexon-collections'

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Resolve a Collection-bound workspace the user may use.
 * Prefer the PLEXON-provisioned mirror; if missing, trigger sync and retry briefly,
 * then fail closed rather than inventing unauthorized membership.
 */
export async function resolveAccessibleWorkspace(input: {
  plexonUserId: string
  platformProjectId: string
}): Promise<
  | { ok: true; workspace: ProvisionedWorkspace; collection: AccessibleCollection | null }
  | { ok: false; code: 'collection_access_denied' | 'not_found' | 'dependency_unavailable' }
> {
  const platformProjectId = input.platformProjectId.trim()
  if (!platformProjectId) return { ok: false, code: 'not_found' }

  const directory = await fetchAccessibleCollections(input.plexonUserId)
  const collection = directory?.items.find((item) => item.id === platformProjectId) ?? null
  if (directory && !collection) return { ok: false, code: 'collection_access_denied' }

  let workspace = await findWorkspace(platformProjectId)
  if (workspace && (await canReadWorkspace(workspace, input.plexonUserId))) {
    return { ok: true, workspace, collection }
  }

  if (collection) {
    await requestVideonMirrorSync(input.plexonUserId, platformProjectId)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await sleep(350 * (attempt + 1))
      workspace = await findWorkspace(platformProjectId)
      if (workspace && (await canReadWorkspace(workspace, input.plexonUserId))) {
        return { ok: true, workspace, collection }
      }
    }

    // Staging fallback when PLEXON mirror lag/opt-in still blocks: create a local
    // Access Model B projection for the authenticated Collection assignee only.
    const ensured = await upsertWorkspace({
      platformProjectId: collection.id,
      platformCompanyId: collection.companyId,
      ownerPlexonUserId: input.plexonUserId,
      members: [{ plexonUserId: input.plexonUserId, role: 'admin' }],
      name: collection.name,
      domain: collection.domain,
      status: collection.status === 'archived' ? 'archived' : 'active',
    })
    return { ok: true, workspace: ensured.workspace, collection }
  }

  if (!workspace) return { ok: false, code: 'not_found' }
  return { ok: false, code: 'collection_access_denied' }
}
