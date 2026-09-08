/**
 * Nested JSON translators (Audion/Checkion/Plexon-style). Spec: specs/domain/settings.md
 */

import de from '../locales/de.json'
import en from '../locales/en.json'
import { paths } from './paths'

export type Locale = (typeof paths.localeChoices)[number]

const dictionaries: Record<Locale, Record<string, unknown>> = { en, de }

function getNestedValue(source: Record<string, unknown> | undefined, path: string): unknown {
  if (!source) return undefined
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, source)
}

function interpolate(value: string, params?: Record<string, string | number>): string {
  if (!params) return value
  return value.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) return String(params[key])
    return match
  })
}

export function normalizeLocale(value?: string | null): Locale {
  if (!value) return paths.defaultLocale
  const lower = value.toLowerCase()
  if (lower.startsWith('de')) return 'de'
  if (lower.startsWith('en')) return 'en'
  return paths.defaultLocale
}

export type Translator = (key: string, params?: Record<string, string | number>) => string

export function createTranslator(locale: Locale): Translator {
  const dictionary = (dictionaries[locale] ?? dictionaries[paths.defaultLocale]) as Record<
    string,
    unknown
  >
  const fallback = dictionaries[paths.defaultLocale] as Record<string, unknown>
  return (key: string, params?: Record<string, string | number>): string => {
    const raw = getNestedValue(dictionary, key) ?? getNestedValue(fallback, key) ?? key
    return interpolate(String(raw), params)
  }
}
