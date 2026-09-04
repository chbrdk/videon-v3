import {
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_SERVICE_SECRET_HEADER,
} from '@videon-v3/contracts'
import { isPlexonAuthConfigured, plexonAuthUrl, plexonServiceSecret } from './runtime-config'

export { isPlexonAuthConfigured }

export type PlexonAuthUser = { id: string; email: string; name?: string }

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
        [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
        [PLEXON_SERVICE_SECRET_HEADER]: plexonServiceSecret(),
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
