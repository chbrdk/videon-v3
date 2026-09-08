import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('app-shell primary nav IA', () => {
  it('lists Projekte and Mediathek as peers; no footer-only project switcher', () => {
    const source = readFileSync(join(__dirname, '../components/app-shell.tsx'), 'utf8')
    expect(source).toMatch(/PRIMARY_NAV_IDS/)
    expect(source).toMatch(/id: 'projects'/)
    expect(source).toMatch(/id: 'library'/)
    expect(source).toMatch(/paths\.routes\.projects/)
    expect(source).not.toMatch(/id: 'collection'/)
  })
})
