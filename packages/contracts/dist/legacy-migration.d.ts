export declare const LEGACY_MIGRATION_SCHEMA_VERSION: "videon.legacy-migration.v1";
export declare const LEGACY_MIGRATION_DECISIONS: readonly ["migrate", "quarantine", "skip"];
export type LegacyMigrationDecision = (typeof LEGACY_MIGRATION_DECISIONS)[number];
export type LegacyMigrationEntry = {
    legacyWorkspaceId: string;
    legacyCutIds?: string[];
    targetPlatformProjectId?: string;
    ownerPlexonUserId?: string;
    decision: LegacyMigrationDecision;
    quarantineReason?: string;
    evidence?: string;
};
export type LegacyMigrationMappingReport = {
    schemaVersion: typeof LEGACY_MIGRATION_SCHEMA_VERSION;
    source: string;
    generatedAt: string;
    operator?: string;
    notes?: string;
    entries: LegacyMigrationEntry[];
};
export type LegacyMigrationIssue = {
    field: string;
    code: 'required' | 'invalid';
    message: string;
};
export type LegacyMigrationParseResult = {
    ok: true;
    value: LegacyMigrationMappingReport;
} | {
    ok: false;
    issues: LegacyMigrationIssue[];
};
/**
 * Strict parser for opt-in legacy → v3 mapping reports (V7).
 * Rejects migrate rows without Collection + owner; enforces quarantine reasons;
 * rejects duplicate workspace/cut ids across migrate rows.
 */
export declare function parseLegacyMigrationMappingReport(input: unknown): LegacyMigrationParseResult;
