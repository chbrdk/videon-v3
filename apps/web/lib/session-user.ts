import { auth } from '@/auth'

export async function requireSessionUserId(): Promise<string | null> {
  const session = await auth()
  const id = session?.user?.id?.trim()
  return id || null
}
