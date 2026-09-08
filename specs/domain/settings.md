# Settings — Theme, Locale, Prefs

**Status:** Accepted  
**Surface:** `/settings` (`SettingsShell`)  
**Related:** `videon-ui-surfaces.md` · `knowledge/i18n.md` · Audion/Checkion `user-prefs` pattern  
**Federation:** Profile prefs sync via PLEXON `/api/services/profile` (`locale`, `themePreference`, `accentPreference`)

## Purpose

VIDEON settings match the other Collection products: appearance (theme + accent), language (en/de), account/profile chrome, plus VIDEON extras (federation / Collection). First paint and unset prefs default to **light** theme and **de** locale.

## Guarantees (EARS)

1. WHEN `/settings` renders THEN it MUST compose `@msqdx/ui` `SettingsShell` with Account, Profile, Appearance, and Language bands.
2. WHEN the operator changes theme THEN the app MUST apply `applyThemePreference` immediately, persist `videon.v3.themePreference`, and PATCH Plexon profile when authenticated.
3. WHEN no theme preference is stored AND no remote profile theme exists THEN the app MUST use `paths.defaultTheme` = `light` (`data-theme=msqdx`).
4. WHEN the operator changes locale THEN the app MUST set `html[lang]`, persist `videon.v3.locale`, re-render via `createTranslator`, and PATCH Plexon profile when authenticated.
5. WHEN Accent changes THEN `applyAccentPreference` MUST run and persist `videon.v3.accentPreference`.
6. WHERE Plexon auth/profile is unavailable THEN localStorage prefs MUST still work (fail soft on remote sync).
7. WHEN first HTML paints THEN `data-theme` MUST be `resolveThemeId(paths.defaultTheme)` — NOT a hardcoded `msqdx-dark`.

## Theme choices

`light` | `dark` | `auto` (same as Audion/Checkion/Plexon). Default for VIDEON: **light**.

## Language

Nested JSON dictionaries `apps/web/locales/{de,en}.json` + `lib/i18n.ts`. No next-intl. Shell nav and settings strings MUST go through `t(...)`.

## Non-goals

- Admin/API-token bands (Audion/Brandion-only)
- URL locale segments
- Forcing light-only (operator may still pick dark/auto)
