import { auth } from '@/auth'
import { headers } from 'next/headers'
import {
  authorizeFederationRequest,
  plexonUserId,
} from '@/lib/federation'
import { resolveApiTokenOwner } from '@/lib/fixtures/api-tokens-store'

/**
 * Authenticated Plexon user id for Product routes.
 * Order: Settings API Bearer → service secret + X-Plexon-User-Id → session.
 * Spec: mcp-server.md · settings-api-tokens.md
 */
export async function requireSessionUserId(): Promise<string | null> {
  try {
    const h = await headers()
    const fromToken = resolveApiTokenOwner(h.get('authorization'))
    if (fromToken?.ownerId) return fromToken.ownerId

    const reqLike = {
      headers: {
        get: (name: string) => h.get(name),
      },
    } as Request
    const fed = authorizeFederationRequest(reqLike)
    if (fed.ok) {
      const actor = plexonUserId(reqLike)
      if (actor) return actor
    }
  } catch {
    /* headers() unavailable outside request context */
  }
  const session = await auth()
  const id = session?.user?.id?.trim()
  return id || null
}
