import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('media list API', () => {
  it('supports accessible Mediathek without platformProjectId', () => {
    const source = readFileSync(join(__dirname, '../app/api/media/route.ts'), 'utf8')
    expect(source).toMatch(/listMediaForAccessibleProjects/)
    expect(source).toMatch(/scope: 'accessible'/)
    expect(source).toMatch(/fetchAccessibleCollections/)
    expect(source).not.toMatch(/platformProjectId is required/)
  })

  it('lists across allowlisted projects with membership join', () => {
    const source = readFileSync(join(__dirname, '../lib/db/media.ts'), 'utf8')
    expect(source).toMatch(/listMediaForAccessibleProjects/)
    expect(source).toMatch(/videon_workspace_members/)
    expect(source).toMatch(/platform_project_id = any/)
  })
})
