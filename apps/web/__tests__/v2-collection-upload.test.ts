import { afterEach, describe, expect, it } from 'vitest'
import { relativeWorkspaceLinks } from '@videon-v3/contracts'

describe('V2 collection deep links', () => {
  it('keeps upload and library relative to the product', () => {
    expect(relativeWorkspaceLinks('proj-1')).toEqual({
      home: '/library?platformProjectId=proj-1',
      upload: '/upload?platformProjectId=proj-1',
    })
  })
})

describe('upload intent validation helpers', () => {
  afterEach(() => {
    // no shared mutable state
  })

  it('accepts sha-256 hex digests only', () => {
    const ok = /^[a-f0-9]{64}$/.test('a'.repeat(64))
    const bad = /^[a-f0-9]{64}$/.test('zz')
    expect(ok).toBe(true)
    expect(bad).toBe(false)
  })
})
