import { describe, expect, it } from 'vitest'
import { createTranslator, normalizeLocale } from '@/lib/i18n'
import { paths } from '@/lib/paths'
import { resolveThemeId } from '@msqdx/ui'

describe('i18n', () => {
  it('defaults and normalizes locales', () => {
    expect(normalizeLocale(null)).toBe(paths.defaultLocale)
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('de-DE')).toBe('de')
  })

  it('translates settings keys in de and en', () => {
    const de = createTranslator('de')
    const en = createTranslator('en')
    expect(de('settings.themeLight')).toBe('Hell')
    expect(en('settings.themeLight')).toBe('Light')
    expect(de('nav.settings')).toBe('Einstellungen')
    expect(en('nav.settings')).toBe('Settings')
    expect(de('nav.library')).toBe('Mediathek')
    expect(de('nav.chooseCollection')).toBe('Projekt wählen')
    expect(de('library.deck')).toContain('dieser Collection')
    expect(en('nav.libraryAria', { collection: 'Acme' })).toBe('Library · Acme')
  })
})

describe('theme defaults', () => {
  it('resolves light default to msqdx data-theme', () => {
    expect(paths.defaultTheme).toBe('light')
    expect(resolveThemeId(paths.defaultTheme)).toBe('msqdx')
  })
})
