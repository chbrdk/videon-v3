"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const index_js_1 = require("./index.js");
(0, node_test_1.default)('accepts the canonical provisioning body', () => {
    const result = (0, index_js_1.parseProvisionWorkspaceRequest)({
        platformProjectId: 'project-1',
        platformCompanyId: 'company-1',
        ownerPlexonUserId: 'user-1',
        members: [{ plexonUserId: 'user-1', role: 'admin' }],
        name: 'Launch campaign',
        domain: 'example.com',
        status: 'active',
    });
    strict_1.default.equal(result.ok, true);
    if (result.ok) {
        strict_1.default.equal(result.value.name, 'Launch campaign');
        strict_1.default.equal(result.value.status, 'active');
    }
    strict_1.default.equal(index_js_1.PLEXON_FEDERATION_CONTRACT_VERSION, '2026-05-plexon-federation-v3');
});
(0, node_test_1.default)('rejects an ownerless or malformed provisioning body', () => {
    const result = (0, index_js_1.parseProvisionWorkspaceRequest)({
        platformProjectId: 'project-1',
        platformCompanyId: 'company-1',
        name: 'Launch campaign',
        status: 'deleted',
    });
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.deepEqual(result.issues.map((issue) => issue.field), ['ownerPlexonUserId', 'members', 'status']);
    }
});
(0, node_test_1.default)('generates only product-relative workspace links', () => {
    strict_1.default.deepEqual((0, index_js_1.relativeWorkspaceLinks)('a/b'), {
        home: '/library?platformProjectId=a%2Fb',
        upload: '/upload?platformProjectId=a%2Fb',
    });
});
(0, node_test_1.default)('rejects a membership projection that does not make the owner an admin', () => {
    const result = (0, index_js_1.parseProvisionWorkspaceRequest)({
        platformProjectId: 'project-1',
        platformCompanyId: 'company-1',
        ownerPlexonUserId: 'user-1',
        members: [{ plexonUserId: 'user-1', role: 'member' }],
        name: 'Launch campaign',
        status: 'active',
    });
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.equal(result.issues[0]?.field, 'members');
    }
});
(0, node_test_1.default)('accepts a valid legacy migration mapping report', () => {
    const result = (0, index_js_1.parseLegacyMigrationMappingReport)({
        schemaVersion: index_js_1.LEGACY_MIGRATION_SCHEMA_VERSION,
        source: 'chbrdk/videon',
        generatedAt: '2026-09-08T18:00:00.000Z',
        entries: [
            {
                legacyWorkspaceId: 'ws-1',
                legacyCutIds: ['cut-1'],
                targetPlatformProjectId: 'collection-1',
                ownerPlexonUserId: 'user-1',
                decision: 'migrate',
                evidence: 'TICKET-1',
            },
            {
                legacyWorkspaceId: 'ws-orphan',
                decision: 'quarantine',
                quarantineReason: 'ownerless',
            },
        ],
    });
    strict_1.default.equal(result.ok, true);
    if (result.ok) {
        strict_1.default.equal(result.value.entries.length, 2);
        strict_1.default.equal(result.value.entries[0]?.decision, 'migrate');
    }
});
(0, node_test_1.default)('rejects migrate without Collection owner and quarantine without reason', () => {
    const result = (0, index_js_1.parseLegacyMigrationMappingReport)({
        schemaVersion: index_js_1.LEGACY_MIGRATION_SCHEMA_VERSION,
        source: 'chbrdk/videon',
        generatedAt: '2026-09-08T18:00:00.000Z',
        entries: [
            { legacyWorkspaceId: 'ws-1', decision: 'migrate' },
            { legacyWorkspaceId: 'ws-2', decision: 'quarantine' },
        ],
    });
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        const fields = result.issues.map((issue) => issue.field);
        strict_1.default.ok(fields.includes('entries[0].targetPlatformProjectId'));
        strict_1.default.ok(fields.includes('entries[0].ownerPlexonUserId'));
        strict_1.default.ok(fields.includes('entries[1].quarantineReason'));
    }
});
