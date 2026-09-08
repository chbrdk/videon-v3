import {
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_SERVICE_SECRET_HEADER,
} from '@videon-v3/contracts'
import { isPlexonAuthConfigured, plexonAuthUrl, plexonServiceSecret } from './runtime-config'

export { isPlexonAuthConfigured }

export type PlexonAuthUser = { id: string; email: string; name?: string }

export type PlexonProfile = {
  id: string
  email: string
  name?: string
  locale?: string
  themePreference?: string
  accentPreference?: string
}

function plexonContractHeaders(secret: string): Record<string, string> {
  return {
    [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
    [PLEXON_SERVICE_SECRET_HEADER]: secret,
  }
}

function mapPlexonServiceUser(user: unknown): PlexonProfile | null {
  if (!user || typeof user !== 'object') return null
  const u = user as Record<string, unknown>
  if (typeof u.id !== 'string' || typeof u.email !== 'string') return null
  return {
    id: u.id,
    email: u.email,
    ...(typeof u.name === 'string' ? { name: u.name } : {}),
    locale: typeof u.locale === 'string' ? u.locale : undefined,
    themePreference: typeof u.themePreference === 'string' ? u.themePreference : undefined,
    accentPreference: typeof u.accentPreference === 'string' ? u.accentPreference : undefined,
  }
}

/** Validate credentials only against PLEXON; VIDEON never stores passwords. */
export async function validateCredentialsWithPlexon(
  email: string,
  password: string,
): Promise<PlexonAuthUser | null> {
  if (!isPlexonAuthConfigured()) return null
  try {
    const response = await fetch(`${plexonAuthUrl()}/api/auth/validate-credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...plexonContractHeaders(plexonServiceSecret()),
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    })
    if (!response.ok) return null
    const body = (await response.json()) as { user?: unknown }
    const user = body.user as Record<string, unknown> | undefined
    if (!user || typeof user.id !== 'string' || typeof user.email !== 'string') return null
    return { id: user.id, email: user.email, ...(typeof user.name === 'string' ? { name: user.name } : {}) }
  } catch {
    return null
  }
}

export async function getPlexonProfile(userId: string): Promise<PlexonProfile | null> {
  if (!isPlexonAuthConfigured()) return null
  const base = plexonAuthUrl().replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/services/profile?user_id=${encodeURIComponent(userId)}`, {
      headers: plexonContractHeaders(plexonServiceSecret()),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { user?: unknown }
    return mapPlexonServiceUser(data?.user)
  } catch (e) {
    console.error('[VIDEON-v3] PLEXON getProfile error:', e)
    return null
  }
}

export async function patchPlexonProfile(
  userId: string,
  updates: {
    locale?: string | null
    themePreference?: string | null
    accentPreference?: string | null
  },
): Promise<PlexonProfile | null> {
  if (!isPlexonAuthConfigured()) return null
  const base = plexonAuthUrl().replace(/\/$/, '')
  const body: Record<string, unknown> = { user_id: userId }
  if (updates.locale !== undefined) body.locale = updates.locale
  if (updates.themePreference !== undefined) body.themePreference = updates.themePreference
  if (updates.accentPreference !== undefined) body.accentPreference = updates.accentPreference
  try {
    const res = await fetch(`${base}/api/services/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...plexonContractHeaders(plexonServiceSecret()),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { user?: unknown }
    return mapPlexonServiceUser(data?.user)
  } catch (e) {
    console.error('[VIDEON-v3] PLEXON patchProfile error:', e)
    return null
  }
}
