import { randomUUID } from 'node:crypto'
import type {
  ProvisionWorkspaceRequest,
  ProvisionedWorkspace,
} from '@videon-v3/contracts'
import { databasePool } from './client'

type WorkspaceRow = {
  id: string
  platform_project_id: string
  platform_company_id: string
  owner_plexon_user_id: string
  name: string
  domain: string | null
  status: ProvisionedWorkspace['status']
}

function mapWorkspace(row: WorkspaceRow): ProvisionedWorkspace {
  return {
    id: row.id,
    platformProjectId: row.platform_project_id,
    platformCompanyId: row.platform_company_id,
    ownerPlexonUserId: row.owner_plexon_user_id,
    name: row.name,
    domain: row.domain,
    status: row.status,
  }
}

export async function findWorkspace(platformProjectId: string): Promise<ProvisionedWorkspace | null> {
  const result = await databasePool().query<WorkspaceRow>(
    `select id, platform_project_id, platform_company_id, owner_plexon_user_id, name, domain, status
       from videon_workspaces
      where platform_project_id = $1`,
    [platformProjectId],
  )
  return result.rows[0] ? mapWorkspace(result.rows[0]) : null
}

export async function upsertWorkspace(input: ProvisionWorkspaceRequest): Promise<{
  workspace: ProvisionedWorkspace
  created: boolean
}> {
  const existing = await findWorkspace(input.platformProjectId)
  const id = existing?.id ?? randomUUID()
  const connection = await databasePool().connect()
  try {
    await connection.query('begin')
    const result = await connection.query<WorkspaceRow>(
    `insert into videon_workspaces (
       id, platform_project_id, platform_company_id, owner_plexon_user_id, name, domain, status,
       federation_contract_version
     ) values ($1, $2, $3, $4, $5, $6, $7, '2026-05-plexon-federation-v3')
     on conflict (platform_project_id) do update set
       platform_company_id = excluded.platform_company_id,
       owner_plexon_user_id = excluded.owner_plexon_user_id,
       name = excluded.name,
       domain = excluded.domain,
       status = excluded.status,
       federation_contract_version = excluded.federation_contract_version,
       updated_at = now()
     returning id, platform_project_id, platform_company_id, owner_plexon_user_id, name, domain, status`,
    [
      id,
      input.platformProjectId,
      input.platformCompanyId,
      input.ownerPlexonUserId,
      input.name,
      input.domain ?? null,
      input.status,
    ],
    )
    const workspace = mapWorkspace(result.rows[0])

    // The provisioning body is authoritative: a removed PLEXON assignment is revoked here.
    await connection.query('delete from videon_workspace_members where workspace_id = $1', [workspace.id])
    for (const member of input.members) {
      await connection.query(
        `insert into videon_workspace_members (workspace_id, plexon_user_id, role)
         values ($1, $2, $3)`,
        [workspace.id, member.plexonUserId, member.role],
      )
    }
    await connection.query('commit')
    return { workspace, created: !existing }
  } catch (error) {
    await connection.query('rollback')
    throw error
  } finally {
    connection.release()
  }
}

export async function canReadWorkspace(workspace: ProvisionedWorkspace, plexonUserId: string): Promise<boolean> {
  if (workspace.ownerPlexonUserId === plexonUserId) return true
  const result = await databasePool().query<{ exists: boolean }>(
    `select exists(
       select 1 from videon_workspace_members
        where workspace_id = $1 and plexon_user_id = $2
     ) as exists`,
    [workspace.id, plexonUserId],
  )
  return result.rows[0]?.exists === true
}
