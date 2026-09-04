"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIDEON_WORKSPACE_MEMBER_ROLES = exports.VIDEON_WORKSPACE_STATUSES = exports.PLEXON_USER_HEADER = exports.PLEXON_SERVICE_SECRET_HEADER = exports.PLEXON_CONTRACT_VERSION_HEADER = exports.PLEXON_FEDERATION_CONTRACT_VERSION = void 0;
exports.parseProvisionWorkspaceRequest = parseProvisionWorkspaceRequest;
exports.relativeWorkspaceLinks = relativeWorkspaceLinks;
exports.PLEXON_FEDERATION_CONTRACT_VERSION = '2026-05-plexon-federation-v3';
exports.PLEXON_CONTRACT_VERSION_HEADER = 'X-Plexon-Contract-Version';
exports.PLEXON_SERVICE_SECRET_HEADER = 'X-Service-Secret';
exports.PLEXON_USER_HEADER = 'X-Plexon-User-Id';
exports.VIDEON_WORKSPACE_STATUSES = ['active', 'archived'];
exports.VIDEON_WORKSPACE_MEMBER_ROLES = ['admin', 'member'];
function asRequiredString(value, field, issues) {
    if (typeof value !== 'string' || !value.trim()) {
        issues.push({ field, code: 'required', message: `${field} is required` });
        return null;
    }
    return value.trim();
}
function parseMembers(value, ownerPlexonUserId, issues) {
    if (!Array.isArray(value) || value.length === 0) {
        issues.push({ field: 'members', code: 'required', message: 'members must contain the workspace owner' });
        return [];
    }
    const members = new Map();
    value.forEach((entry, index) => {
        const field = `members[${index}]`;
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            issues.push({ field, code: 'invalid', message: 'member must be an object' });
            return;
        }
        const record = entry;
        if (typeof record.plexonUserId !== 'string' || !record.plexonUserId.trim()) {
            issues.push({ field, code: 'invalid', message: 'member plexonUserId is required' });
            return;
        }
        if (!exports.VIDEON_WORKSPACE_MEMBER_ROLES.includes(record.role)) {
            issues.push({ field, code: 'invalid', message: 'member role must be admin or member' });
            return;
        }
        const userId = record.plexonUserId.trim();
        const role = record.role;
        const previous = members.get(userId);
        if (previous && previous !== role) {
            issues.push({ field, code: 'invalid', message: 'member has conflicting roles' });
            return;
        }
        members.set(userId, role);
    });
    if (ownerPlexonUserId && members.get(ownerPlexonUserId) !== 'admin') {
        issues.push({ field: 'members', code: 'invalid', message: 'workspace owner must be an admin member' });
    }
    return [...members.entries()]
        .map(([plexonUserId, role]) => ({ plexonUserId, role }))
        .sort((a, b) => a.plexonUserId.localeCompare(b.plexonUserId));
}
/** Strict parser for PLEXON → VIDEON provisioning. Unknown fields are ignored by design. */
function parseProvisionWorkspaceRequest(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, issues: [{ field: 'payload', code: 'invalid', message: 'JSON object required' }] };
    }
    const record = input;
    const issues = [];
    const platformProjectId = asRequiredString(record.platformProjectId, 'platformProjectId', issues);
    const platformCompanyId = asRequiredString(record.platformCompanyId, 'platformCompanyId', issues);
    const ownerPlexonUserId = asRequiredString(record.ownerPlexonUserId, 'ownerPlexonUserId', issues);
    const members = parseMembers(record.members, ownerPlexonUserId, issues);
    const name = asRequiredString(record.name, 'name', issues);
    const status = record.status;
    if (!exports.VIDEON_WORKSPACE_STATUSES.includes(status)) {
        issues.push({ field: 'status', code: 'invalid', message: 'status must be active or archived' });
    }
    const domain = record.domain;
    if (domain != null && (typeof domain !== 'string' || domain.trim().length === 0)) {
        issues.push({ field: 'domain', code: 'invalid', message: 'domain must be a non-empty string or null' });
    }
    if (issues.length || !platformProjectId || !platformCompanyId || !ownerPlexonUserId || !name) {
        return { ok: false, issues };
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
            status: status,
        },
    };
}
function relativeWorkspaceLinks(platformProjectId) {
    const id = encodeURIComponent(platformProjectId);
    return {
        home: `/library?platformProjectId=${id}`,
        upload: `/upload?platformProjectId=${id}`,
    };
}
