import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { VIDEON_TOOL_NAMES } from './tools.js'

describe('videon MCP tool inventory', () => {
  it('exports unique Phase-1 tools with videon. prefix', () => {
    assert.ok(VIDEON_TOOL_NAMES.length >= 6)
    const set = new Set(VIDEON_TOOL_NAMES)
    assert.equal(set.size, VIDEON_TOOL_NAMES.length)
    for (const name of VIDEON_TOOL_NAMES) {
      assert.ok(name.startsWith('videon.'), name)
    }
  })

  it('includes Phase-1 read tools', () => {
    for (const required of [
      'videon.health',
      'videon.projects_list',
      'videon.media_search',
      'videon.media_list',
      'videon.media_get',
      'videon.analysis_get',
      'videon.cuts_list',
      'videon.cut_get',
    ] as const) {
      assert.ok(VIDEON_TOOL_NAMES.includes(required), required)
    }
  })
})
