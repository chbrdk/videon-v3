import { auth } from '@/auth'
import { headers } from 'next/headers'
import { resolveApiTokenOwner } from '@/lib/fixtures/api-tokens-store'

/**
 * Authenticated Plexon user id: Bearer API token first, then session.
 * Spec: settings-api-tokens.md · mcp-server.md
 */
export async function requireSessionUserId(): Promise<string | null> {
  try {
    const h = await headers()
    const fromToken = resolveApiTokenOwner(h.get('authorization'))
    if (fromToken?.ownerId) return fromToken.ownerId
  } catch {
    /* headers() unavailable outside request context */
  }
  const session = await auth()
  const id = session?.user?.id?.trim()
  return id || null
}
