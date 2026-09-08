import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { revokeApiTokenForOwner, toApiTokenOwnerId } from '@/lib/api-tokens'
import { isPlexonAuthConfigured } from '@/lib/runtime-config'

export const dynamic = 'force-dynamic'

type RouteProps = { params: Promise<{ tokenId: string }> }

export async function DELETE(_request: Request, { params }: RouteProps) {
  const session = await auth()
  if (isPlexonAuthConfigured() && !session?.user?.id && !session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { tokenId } = await params
  const ownerId = toApiTokenOwnerId(session?.user)
  const result = await revokeApiTokenForOwner(tokenId, ownerId)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
