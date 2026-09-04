import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PLEXON_FEDERATION_CONTRACT_VERSION,
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
