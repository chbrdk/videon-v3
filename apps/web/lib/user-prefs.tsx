'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  applyAccentPreference,
  applyThemePreference,
  migrateLegacyAccent,
  migrateLegacyThemeId,
  type AccentPreference,
  type ThemePreference,
} from '@msqdx/ui'
import { createTranslator, type Translator } from './i18n'
import { paths } from './paths'

export type UiThemeId = ThemePreference
export type UiLocaleId = (typeof paths.localeChoices)[number]
export type UiAccentId = AccentPreference

type UserPrefsContextValue = {
  displayName: string
  setDisplayName: (next: string) => void
  theme: UiThemeId
  setTheme: (next: UiThemeId) => void
  accent: UiAccentId
  setAccent: (next: UiAccentId) => void
  locale: UiLocaleId
  setLocale: (next: UiLocaleId) => void
  t: Translator
}

const UserPrefsContext = createContext<UserPrefsContextValue | null>(null)

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function readDisplayName(): string {
  const raw = readStored(paths.displayNameStorageKey)
  if (raw && raw.trim()) return raw.trim()
  return paths.defaultDisplayName
}

function readTheme(): UiThemeId {
  const raw = readStored(paths.themeStorageKey)
  if (!raw) return paths.defaultTheme
  return migrateLegacyThemeId(raw)
}

function readAccent(): UiAccentId {
  return migrateLegacyAccent(readStored(paths.accentStorageKey))
}

function readLocale(): UiLocaleId {
  const raw = readStored(paths.localeStorageKey)
  if (raw && (paths.localeChoices as readonly string[]).includes(raw)) {
    return raw as UiLocaleId
  }
  return paths.defaultLocale
}

function applyLocale(locale: UiLocaleId) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('lang', locale)
}

async function patchRemotePrefs(body: {
  locale?: string
  themePreference?: string
  accentPreference?: string
}) {
  try {
    await fetch('/api/prefs/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    /* offline / unauthenticated — local cache still applies */
  }
}

export function UserPrefsProvider({ children }: { children: ReactNode }) {
  const [displayName, setDisplayNameState] = useState<string>(paths.defaultDisplayName)
  const [theme, setThemeState] = useState<UiThemeId>(paths.defaultTheme)
  const [accent, setAccentState] = useState<UiAccentId>('green')
  const [locale, setLocaleState] = useState<UiLocaleId>(paths.defaultLocale)
  const [hydrated, setHydrated] = useState(false)
  const themeCleanup = useRef<(() => void) | undefined>(undefined)

  const paintTheme = useCallback((next: UiThemeId) => {
    themeCleanup.current?.()
    themeCleanup.current = applyThemePreference(next)
  }, [])

  const paintAccent = useCallback((next: UiAccentId) => {
    applyAccentPreference(next)
  }, [])

  useEffect(() => {
    const nextTheme = readTheme()
    const nextAccent = readAccent()
    const nextLocale = readLocale()
    setDisplayNameState(readDisplayName())
    setThemeState(nextTheme)
    setAccentState(nextAccent)
    setLocaleState(nextLocale)
    paintTheme(nextTheme)
    paintAccent(nextAccent)
    applyLocale(nextLocale)
    setHydrated(true)

    void fetch('/api/prefs/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const user = data?.user
        if (!user) return
        if (typeof user.locale === 'string' && (paths.localeChoices as readonly string[]).includes(user.locale)) {
          const next = user.locale as UiLocaleId
          setLocaleState(next)
          writeStored(paths.localeStorageKey, next)
          applyLocale(next)
        }
        if (user.themePreference != null) {
          const pref = migrateLegacyThemeId(user.themePreference)
          setThemeState(pref)
          writeStored(paths.themeStorageKey, pref)
          paintTheme(pref)
        }
        if (user.accentPreference != null) {
          const next = migrateLegacyAccent(user.accentPreference)
          setAccentState(next)
          writeStored(paths.accentStorageKey, next)
          paintAccent(next)
        }
      })
      .catch(() => undefined)

    return () => themeCleanup.current?.()
  }, [paintTheme, paintAccent])

  const setDisplayName = useCallback((next: string) => {
    const trimmed = next.trim() || paths.defaultDisplayName
    setDisplayNameState(trimmed)
    writeStored(paths.displayNameStorageKey, trimmed)
  }, [])

  const setTheme = useCallback(
    (next: UiThemeId) => {
      setThemeState(next)
      writeStored(paths.themeStorageKey, next)
      paintTheme(next)
      void patchRemotePrefs({ themePreference: next })
    },
    [paintTheme],
  )

  const setAccent = useCallback(
    (next: UiAccentId) => {
      setAccentState(next)
      writeStored(paths.accentStorageKey, next)
      paintAccent(next)
      void patchRemotePrefs({ accentPreference: next })
    },
    [paintAccent],
  )

  const setLocale = useCallback((next: UiLocaleId) => {
    setLocaleState(next)
    writeStored(paths.localeStorageKey, next)
    applyLocale(next)
    void patchRemotePrefs({ locale: next })
  }, [])

  const t = useMemo(() => createTranslator(locale), [locale])

  const value = useMemo(
    () => ({
      displayName,
      setDisplayName,
      theme,
      setTheme,
      accent,
      setAccent,
      locale,
      setLocale,
      t,
    }),
    [displayName, setDisplayName, theme, setTheme, accent, setAccent, locale, setLocale, t],
  )

  return (
    <UserPrefsContext.Provider value={value}>
      <span className="visually-hidden" data-prefs-hydrated={hydrated ? 'true' : 'false'} />
      {children}
    </UserPrefsContext.Provider>
  )
}

export function useUserPrefs(): UserPrefsContextValue {
  const ctx = useContext(UserPrefsContext)
  if (!ctx) {
    throw new Error('useUserPrefs requires UserPrefsProvider')
  }
  return ctx
}

/** Translator — falls back to default locale when outside UserPrefsProvider (tests). */
export function useT(): Translator {
  const ctx = useContext(UserPrefsContext)
  return useMemo(() => ctx?.t ?? createTranslator(paths.defaultLocale), [ctx?.t])
}
