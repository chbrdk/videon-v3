import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LEGACY_MIGRATION_SCHEMA_VERSION,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  parseLegacyMigrationMappingReport,
  parseProvisionWorkspaceRequest,
  relativeWorkspaceLinks,
} from './index.js'

test('accepts the canonical provisioning body', () => {
  const result = parseProvisionWorkspaceRequest({
    platformProjectId: 'project-1',
    platformCompanyId: 'company-1',
    ownerPlexonUserId: 'user-1',
    members: [{ plexonUserId: 'user-1', role: 'admin' }],
    name: 'Launch campaign',
    domain: 'example.com',
    status: 'active',
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.value.name, 'Launch campaign')
    assert.equal(result.value.status, 'active')
  }
  assert.equal(PLEXON_FEDERATION_CONTRACT_VERSION, '2026-05-plexon-federation-v3')
})

test('rejects an ownerless or malformed provisioning body', () => {
  const result = parseProvisionWorkspaceRequest({
    platformProjectId: 'project-1',
    platformCompanyId: 'company-1',
    name: 'Launch campaign',
    status: 'deleted',
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.deepEqual(
      result.issues.map((issue) => issue.field),
      ['ownerPlexonUserId', 'members', 'status'],
    )
  }
})

test('generates only product-relative workspace links', () => {
  assert.deepEqual(relativeWorkspaceLinks('a/b'), {
    home: '/library?platformProjectId=a%2Fb',
    upload: '/upload?platformProjectId=a%2Fb',
  })
})

test('rejects a membership projection that does not make the owner an admin', () => {
  const result = parseProvisionWorkspaceRequest({
    platformProjectId: 'project-1',
    platformCompanyId: 'company-1',
    ownerPlexonUserId: 'user-1',
    members: [{ plexonUserId: 'user-1', role: 'member' }],
    name: 'Launch campaign',
    status: 'active',
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.issues[0]?.field, 'members')
  }
})

test('accepts a valid legacy migration mapping report', () => {
  const result = parseLegacyMigrationMappingReport({
    schemaVersion: LEGACY_MIGRATION_SCHEMA_VERSION,
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
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.value.entries.length, 2)
    assert.equal(result.value.entries[0]?.decision, 'migrate')
  }
})

test('rejects migrate without Collection owner and quarantine without reason', () => {
  const result = parseLegacyMigrationMappingReport({
    schemaVersion: LEGACY_MIGRATION_SCHEMA_VERSION,
    source: 'chbrdk/videon',
    generatedAt: '2026-09-08T18:00:00.000Z',
    entries: [
      { legacyWorkspaceId: 'ws-1', decision: 'migrate' },
      { legacyWorkspaceId: 'ws-2', decision: 'quarantine' },
    ],
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    const fields = result.issues.map((issue) => issue.field)
    assert.ok(fields.includes('entries[0].targetPlatformProjectId'))
    assert.ok(fields.includes('entries[0].ownerPlexonUserId'))
    assert.ok(fields.includes('entries[1].quarantineReason'))
  }
})
