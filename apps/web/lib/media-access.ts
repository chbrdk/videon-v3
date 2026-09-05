import { findMediaAsset, findMediaAssetDetail } from '@/lib/db/media'
import type { MediaAsset, MediaAssetDetail } from '@/lib/db/media'
import type { ProvisionedWorkspace } from '@videon-v3/contracts'
import { resolveAccessibleWorkspace } from '@/lib/workspace-access'

type WorkspaceDenied = {
  ok: false
  code: 'collection_access_denied' | 'not_found' | 'dependency_unavailable'
}

type WorkspaceGranted = {
  ok: true
  workspace: ProvisionedWorkspace
}

export async function resolveWorkspaceForMediaRequest(input: {
  plexonUserId: string
  platformProjectId: string
  writable?: boolean
}): Promise<WorkspaceGranted | WorkspaceDenied> {
  const resolved = await resolveAccessibleWorkspace({
    plexonUserId: input.plexonUserId,
    platformProjectId: input.platformProjectId,
  })
  if (!resolved.ok) return resolved
  if (input.writable && resolved.workspace.status === 'archived') {
    return { ok: false, code: 'collection_access_denied' }
  }
  return { ok: true, workspace: resolved.workspace }
}

export async function resolveMediaInWorkspace(input: {
  plexonUserId: string
  platformProjectId: string
  mediaAssetId: string
  detailed?: boolean
}): Promise<
  | { ok: true; workspace: ProvisionedWorkspace; media: MediaAsset | MediaAssetDetail }
  | WorkspaceDenied
  | { ok: false; code: 'not_found' }
> {
  const workspace = await resolveWorkspaceForMediaRequest({
    plexonUserId: input.plexonUserId,
    platformProjectId: input.platformProjectId,
  })
  if (!workspace.ok) return workspace

  const media = input.detailed
    ? await findMediaAssetDetail(input.mediaAssetId.trim())
    : await findMediaAsset(input.mediaAssetId.trim())
  if (!media || media.workspaceId !== workspace.workspace.id) {
    return { ok: false, code: 'not_found' }
  }
  return { ok: true, workspace: workspace.workspace, media }
}
