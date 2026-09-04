export declare const PLEXON_FEDERATION_CONTRACT_VERSION: "2026-05-plexon-federation-v3";
export declare const PLEXON_CONTRACT_VERSION_HEADER: "X-Plexon-Contract-Version";
export declare const PLEXON_SERVICE_SECRET_HEADER: "X-Service-Secret";
export declare const PLEXON_USER_HEADER: "X-Plexon-User-Id";
export declare const VIDEON_WORKSPACE_STATUSES: readonly ["active", "archived"];
export type VideonWorkspaceStatus = (typeof VIDEON_WORKSPACE_STATUSES)[number];
export declare const VIDEON_WORKSPACE_MEMBER_ROLES: readonly ["admin", "member"];
export type VideonWorkspaceMemberRole = (typeof VIDEON_WORKSPACE_MEMBER_ROLES)[number];
export type ProvisionedWorkspaceMember = {
    plexonUserId: string;
    role: VideonWorkspaceMemberRole;
};
export type ProvisionWorkspaceRequest = {
    platformProjectId: string;
    platformCompanyId: string;
    ownerPlexonUserId: string;
    members: ProvisionedWorkspaceMember[];
    name: string;
    domain?: string | null;
    status: VideonWorkspaceStatus;
};
export type ProvisionedWorkspace = {
    id: string;
    platformProjectId: string;
    platformCompanyId: string;
    ownerPlexonUserId: string;
    name: string;
    domain: string | null;
    status: VideonWorkspaceStatus;
};
export type ProvisionWorkspaceResponse = {
    project: ProvisionedWorkspace;
    created: boolean;
    contractVersion: typeof PLEXON_FEDERATION_CONTRACT_VERSION;
};
export type ContractIssue = {
    field: keyof ProvisionWorkspaceRequest | `members[${number}]` | 'payload';
    code: 'required' | 'invalid';
    message: string;
};
export type ContractParseResult = {
    ok: true;
    value: ProvisionWorkspaceRequest;
} | {
    ok: false;
    issues: ContractIssue[];
};
/** Strict parser for PLEXON → VIDEON provisioning. Unknown fields are ignored by design. */
export declare function parseProvisionWorkspaceRequest(input: unknown): ContractParseResult;
export type ApiErrorCode = 'contract_version_mismatch' | 'service_unauthorized' | 'user_context_required' | 'collection_access_denied' | 'not_found' | 'invalid_payload' | 'dependency_unavailable';
export type ApiError = {
    error: {
        code: ApiErrorCode;
        message: string;
        retryable: boolean;
        requestId: string;
        details?: Record<string, unknown>;
    };
};
export declare function relativeWorkspaceLinks(platformProjectId: string): {
    home: string;
    upload: string;
};
