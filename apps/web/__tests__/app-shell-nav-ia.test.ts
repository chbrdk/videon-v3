import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('app-shell primary nav IA', () => {
  it('keeps Collection switcher out of PRIMARY_NAV capability peers', () => {
    const source = readFileSync(join(__dirname, '../components/app-shell.tsx'), 'utf8')
    expect(source).toMatch(/PRIMARY_NAV_IDS/)
    expect(source).not.toMatch(/id: 'collections'/)
    expect(source).toMatch(/id: 'collection'/)
    expect(source).toMatch(/paths\.routes\.collections/)
    expect(source).toMatch(/nav\.libraryAria/)
  })
})
