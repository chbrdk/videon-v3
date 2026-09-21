import { paths } from './paths'

function getConfiguredPlexonOrigin(): string | null {
  const raw = process.env[paths.envPlexonPublicUrl]?.trim()
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/** Plexon `/forgot-password` — same origin as `NEXT_PUBLIC_PLEXON_URL`. */
export function getPlexonForgotPasswordUrl(): string | null {
  const origin = getConfiguredPlexonOrigin()
  if (!origin) return null
  return `${origin}/forgot-password`
}
