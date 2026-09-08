import { NextResponse } from 'next/server'
import { auth } from '../../../../auth'
import { getPlexonProfile, patchPlexonProfile } from '../../../../lib/plexon-auth'

export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getPlexonProfile(userId)
  if (!user) return NextResponse.json({ error: 'Profile unavailable' }, { status: 502 })
  return NextResponse.json({ user })
}

export async function PATCH(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const updates: {
    locale?: string | null
    themePreference?: string | null
    accentPreference?: string | null
  } = {}
  if (typeof body.locale === 'string') updates.locale = body.locale
  if (typeof body.themePreference === 'string') updates.themePreference = body.themePreference
  if (typeof body.accentPreference === 'string') updates.accentPreference = body.accentPreference
  const user = await patchPlexonProfile(userId, updates)
  if (!user) return NextResponse.json({ error: 'Profile update failed' }, { status: 502 })
  return NextResponse.json({ user })
}
