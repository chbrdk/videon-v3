export const LEGACY_MIGRATION_SCHEMA_VERSION = 'videon.legacy-migration.v1' as const

export const LEGACY_MIGRATION_DECISIONS = ['migrate', 'quarantine', 'skip'] as const
export type LegacyMigrationDecision = (typeof LEGACY_MIGRATION_DECISIONS)[number]

export type LegacyMigrationEntry = {
  legacyWorkspaceId: string
  legacyCutIds?: string[]
  targetPlatformProjectId?: string
  ownerPlexonUserId?: string
  decision: LegacyMigrationDecision
  quarantineReason?: string
  evidence?: string
}

export type LegacyMigrationMappingReport = {
  schemaVersion: typeof LEGACY_MIGRATION_SCHEMA_VERSION
  source: string
  generatedAt: string
  operator?: string
  notes?: string
  entries: LegacyMigrationEntry[]
}

export type LegacyMigrationIssue = {
  field: string
  code: 'required' | 'invalid'
  message: string
}

export type LegacyMigrationParseResult =
  | { ok: true; value: LegacyMigrationMappingReport }
  | { ok: false; issues: LegacyMigrationIssue[] }

function requiredString(value: unknown, field: string, issues: LegacyMigrationIssue[]): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({ field, code: 'required', message: `${field} is required` })
    return null
  }
  return value.trim()
}

function optionalString(value: unknown, field: string, issues: LegacyMigrationIssue[]): string | undefined {
  if (value == null) return undefined
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({ field, code: 'invalid', message: `${field} must be a non-empty string when set` })
    return undefined
  }
  return value.trim()
}

function parseCutIds(value: unknown, field: string, issues: LegacyMigrationIssue[]): string[] | undefined {
  if (value == null) return undefined
  if (!Array.isArray(value)) {
    issues.push({ field, code: 'invalid', message: `${field} must be an array of strings` })
    return undefined
  }
  const ids: string[] = []
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      issues.push({ field: `${field}[${index}]`, code: 'invalid', message: 'cut id must be a non-empty string' })
      return
    }
    ids.push(entry.trim())
  })
  return ids
}

/**
 * Strict parser for opt-in legacy → v3 mapping reports (V7).
 * Rejects migrate rows without Collection + owner; enforces quarantine reasons;
 * rejects duplicate workspace/cut ids across migrate rows.
 */
export function parseLegacyMigrationMappingReport(input: unknown): LegacyMigrationParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, issues: [{ field: 'payload', code: 'invalid', message: 'JSON object required' }] }
  }

  const record = input as Record<string, unknown>
  const issues: LegacyMigrationIssue[] = []

  if (record.schemaVersion !== LEGACY_MIGRATION_SCHEMA_VERSION) {
    issues.push({
      field: 'schemaVersion',
      code: 'invalid',
      message: `schemaVersion must be ${LEGACY_MIGRATION_SCHEMA_VERSION}`,
    })
  }

  const source = requiredString(record.source, 'source', issues)
  const generatedAt = requiredString(record.generatedAt, 'generatedAt', issues)
  if (generatedAt && Number.isNaN(Date.parse(generatedAt))) {
    issues.push({ field: 'generatedAt', code: 'invalid', message: 'generatedAt must be an ISO-8601 timestamp' })
  }

  const operator = optionalString(record.operator, 'operator', issues)
  const notes = optionalString(record.notes, 'notes', issues)

  if (!Array.isArray(record.entries)) {
    issues.push({ field: 'entries', code: 'required', message: 'entries must be an array' })
    return { ok: false, issues }
  }

  const entries: LegacyMigrationEntry[] = []
  const seenWorkspaces = new Set<string>()
  const seenCuts = new Set<string>()

  record.entries.forEach((raw, index) => {
    const prefix = `entries[${index}]`
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      issues.push({ field: prefix, code: 'invalid', message: 'entry must be an object' })
      return
    }
    const entry = raw as Record<string, unknown>
    const legacyWorkspaceId = requiredString(entry.legacyWorkspaceId, `${prefix}.legacyWorkspaceId`, issues)
    const decisionRaw = entry.decision
    if (!LEGACY_MIGRATION_DECISIONS.includes(decisionRaw as LegacyMigrationDecision)) {
      issues.push({
        field: `${prefix}.decision`,
        code: 'invalid',
        message: 'decision must be migrate, quarantine, or skip',
      })
      return
    }
    const decision = decisionRaw as LegacyMigrationDecision
    const legacyCutIds = parseCutIds(entry.legacyCutIds, `${prefix}.legacyCutIds`, issues)
    const targetPlatformProjectId = optionalString(
      entry.targetPlatformProjectId,
      `${prefix}.targetPlatformProjectId`,
      issues,
    )
    const ownerPlexonUserId = optionalString(entry.ownerPlexonUserId, `${prefix}.ownerPlexonUserId`, issues)
    const quarantineReason = optionalString(entry.quarantineReason, `${prefix}.quarantineReason`, issues)
    const evidence = optionalString(entry.evidence, `${prefix}.evidence`, issues)

    if (!legacyWorkspaceId) return

    if (seenWorkspaces.has(legacyWorkspaceId)) {
      issues.push({
        field: `${prefix}.legacyWorkspaceId`,
        code: 'invalid',
        message: 'duplicate legacyWorkspaceId in report',
      })
    }
    seenWorkspaces.add(legacyWorkspaceId)

    if (decision === 'migrate') {
      if (!targetPlatformProjectId) {
        issues.push({
          field: `${prefix}.targetPlatformProjectId`,
          code: 'required',
          message: 'migrate requires targetPlatformProjectId',
        })
      }
      if (!ownerPlexonUserId) {
        issues.push({
          field: `${prefix}.ownerPlexonUserId`,
          code: 'required',
          message: 'migrate requires ownerPlexonUserId',
        })
      }
      for (const cutId of legacyCutIds ?? []) {
        if (seenCuts.has(cutId)) {
          issues.push({
            field: `${prefix}.legacyCutIds`,
            code: 'invalid',
            message: `duplicate legacyCutId ${cutId} across migrate rows`,
          })
        }
        seenCuts.add(cutId)
      }
    }

    if (decision === 'quarantine' && !quarantineReason) {
      issues.push({
        field: `${prefix}.quarantineReason`,
        code: 'required',
        message: 'quarantine requires quarantineReason',
      })
    }

    entries.push({
      legacyWorkspaceId,
      ...(legacyCutIds ? { legacyCutIds } : {}),
      ...(targetPlatformProjectId ? { targetPlatformProjectId } : {}),
      ...(ownerPlexonUserId ? { ownerPlexonUserId } : {}),
      decision,
      ...(quarantineReason ? { quarantineReason } : {}),
      ...(evidence ? { evidence } : {}),
    })
  })

  if (issues.length || !source || !generatedAt) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    value: {
      schemaVersion: LEGACY_MIGRATION_SCHEMA_VERSION,
      source,
      generatedAt,
      ...(operator ? { operator } : {}),
      ...(notes ? { notes } : {}),
      entries,
    },
  }
}
