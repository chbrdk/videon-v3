import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('app-shell primary nav IA', () => {
  it('lists Chat · Projekte · Mediathek · Analysen as CREATION-style top-nav (no NavRail)', () => {
    const source = readFileSync(join(__dirname, '../components/app-shell.tsx'), 'utf8')
    expect(source).toMatch(/PRIMARY_NAV_IDS/)
    expect(source).toMatch(/videon-top-nav/)
    expect(source).toMatch(/videon-app-frame--top-chrome/)
    expect(source).toMatch(/id: 'chat'/)
    expect(source).toMatch(/id: 'projects'/)
    expect(source).toMatch(/id: 'library'/)
    expect(source).toMatch(/id: 'analyses'/)
    expect(source).toMatch(/NavIconProjects/)
    expect(source).toMatch(/NavIconChat/)
    expect(source).not.toMatch(/NavRail/)
    expect(source).not.toMatch(/id: 'upload'/)
    expect(source).not.toMatch(/id: 'cuts'/)
  })
})
