export const PLEXON_FEDERATION_CONTRACT_VERSION = '2026-05-plexon-federation-v3' as const
export const PLEXON_CONTRACT_VERSION_HEADER = 'X-Plexon-Contract-Version' as const
export const PLEXON_SERVICE_SECRET_HEADER = 'X-Service-Secret' as const
export const PLEXON_USER_HEADER = 'X-Plexon-User-Id' as const

export const VIDEON_WORKSPACE_STATUSES = ['active', 'archived'] as const
export type VideonWorkspaceStatus = (typeof VIDEON_WORKSPACE_STATUSES)[number]
export const VIDEON_WORKSPACE_MEMBER_ROLES = ['admin', 'member'] as const
export type VideonWorkspaceMemberRole = (typeof VIDEON_WORKSPACE_MEMBER_ROLES)[number]

export type ProvisionedWorkspaceMember = {
  plexonUserId: string
  role: VideonWorkspaceMemberRole
}

export type ProvisionWorkspaceRequest = {
  platformProjectId: string
  platformCompanyId: string
  ownerPlexonUserId: string
  members: ProvisionedWorkspaceMember[]
  name: string
  domain?: string | null
  status: VideonWorkspaceStatus
}

export type ProvisionedWorkspace = {
  id: string
  platformProjectId: string
  platformCompanyId: string
  ownerPlexonUserId: string
  name: string
  domain: string | null
  status: VideonWorkspaceStatus
}

export type ProvisionWorkspaceResponse = {
  project: ProvisionedWorkspace
  created: boolean
  contractVersion: typeof PLEXON_FEDERATION_CONTRACT_VERSION
}

export type ContractIssue = {
  field: keyof ProvisionWorkspaceRequest | `members[${number}]` | 'payload'
  code: 'required' | 'invalid'
  message: string
}

export type ContractParseResult =
  | { ok: true; value: ProvisionWorkspaceRequest }
  | { ok: false; issues: ContractIssue[] }

function asRequiredString(
  value: unknown,
  field: ContractIssue['field'],
  issues: ContractIssue[],
): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({ field, code: 'required', message: `${field} is required` })
    return null
  }
  return value.trim()
}

function parseMembers(value: unknown, ownerPlexonUserId: string | null, issues: ContractIssue[]): ProvisionedWorkspaceMember[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ field: 'members', code: 'required', message: 'members must contain the workspace owner' })
    return []
  }

  const members = new Map<string, VideonWorkspaceMemberRole>()
  value.forEach((entry, index) => {
    const field = `members[${index}]` as const
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push({ field, code: 'invalid', message: 'member must be an object' })
      return
    }
    const record = entry as Record<string, unknown>
    if (typeof record.plexonUserId !== 'string' || !record.plexonUserId.trim()) {
      issues.push({ field, code: 'invalid', message: 'member plexonUserId is required' })
      return
    }
    if (!VIDEON_WORKSPACE_MEMBER_ROLES.includes(record.role as VideonWorkspaceMemberRole)) {
      issues.push({ field, code: 'invalid', message: 'member role must be admin or member' })
      return
    }
    const userId = record.plexonUserId.trim()
    const role = record.role as VideonWorkspaceMemberRole
    const previous = members.get(userId)
    if (previous && previous !== role) {
      issues.push({ field, code: 'invalid', message: 'member has conflicting roles' })
      return
    }
    members.set(userId, role)
  })

  if (ownerPlexonUserId && members.get(ownerPlexonUserId) !== 'admin') {
    issues.push({ field: 'members', code: 'invalid', message: 'workspace owner must be an admin member' })
  }

  return [...members.entries()]
    .map(([plexonUserId, role]) => ({ plexonUserId, role }))
    .sort((a, b) => a.plexonUserId.localeCompare(b.plexonUserId))
}

/** Strict parser for PLEXON → VIDEON provisioning. Unknown fields are ignored by design. */
export function parseProvisionWorkspaceRequest(input: unknown): ContractParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, issues: [{ field: 'payload', code: 'invalid', message: 'JSON object required' }] }
  }

  const record = input as Record<string, unknown>
  const issues: ContractIssue[] = []
  const platformProjectId = asRequiredString(record.platformProjectId, 'platformProjectId', issues)
  const platformCompanyId = asRequiredString(record.platformCompanyId, 'platformCompanyId', issues)
  const ownerPlexonUserId = asRequiredString(record.ownerPlexonUserId, 'ownerPlexonUserId', issues)
  const members = parseMembers(record.members, ownerPlexonUserId, issues)
  const name = asRequiredString(record.name, 'name', issues)
  const status = record.status

  if (!VIDEON_WORKSPACE_STATUSES.includes(status as VideonWorkspaceStatus)) {
    issues.push({ field: 'status', code: 'invalid', message: 'status must be active or archived' })
  }

  const domain = record.domain
  if (domain != null && (typeof domain !== 'string' || domain.trim().length === 0)) {
    issues.push({ field: 'domain', code: 'invalid', message: 'domain must be a non-empty string or null' })
  }

  if (issues.length || !platformProjectId || !platformCompanyId || !ownerPlexonUserId || !name) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    value: {
      platformProjectId,
      platformCompanyId,
      ownerPlexonUserId,
      members,
      name,
      domain: typeof domain === 'string' ? domain.trim() : null,
      status: status as VideonWorkspaceStatus,
    },
  }
}

export type ApiErrorCode =
  | 'contract_version_mismatch'
  | 'service_unauthorized'
  | 'user_context_required'
  | 'collection_access_denied'
  | 'not_found'
  | 'invalid_payload'
  | 'dependency_unavailable'

export type ApiError = {
  error: {
    code: ApiErrorCode
    message: string
    retryable: boolean
    requestId: string
    details?: Record<string, unknown>
  }
}

export function relativeWorkspaceLinks(platformProjectId: string) {
  const id = encodeURIComponent(platformProjectId)
  return {
    home: `/library?platformProjectId=${id}`,
    upload: `/upload?platformProjectId=${id}`,
  }
}
