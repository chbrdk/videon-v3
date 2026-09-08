import { NextResponse } from 'next/server'
import { verifyApiTokenBearer } from '@/lib/api-tokens'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const result = await verifyApiTokenBearer(request.headers.get('Authorization'))
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, ownerId: result.ownerId, tokenId: result.tokenId })
}
