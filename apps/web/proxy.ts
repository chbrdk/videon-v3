import { NextResponse, type NextRequest } from 'next/server'
import { auth } from './auth'
import { pathLogin } from './lib/paths'
import { isPlexonAuthConfigured } from './lib/plexon-auth'

const gated = auth((request) => {
  const pathname = request.nextUrl.pathname
  const authHeader = request.headers.get('authorization')?.toLowerCase() ?? ''
  const hasBearer = authHeader.startsWith('bearer ')
  const hasServiceSecret = Boolean(request.headers.get('x-service-secret')?.trim())
  /**
   * Machine / MCP clients: Bearer or federation service secret skips login redirect.
   * Routes authenticate via requireSessionUserId() (token / service+actor / session).
   */
  const isPublic =
    pathname === pathLogin ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/federation/health') ||
    pathname.startsWith('/api/platform/provisioning') ||
    pathname.startsWith('/api/tokens/verify') ||
    (pathname.startsWith('/api/') && (hasBearer || hasServiceSecret)) ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  if (isPublic) return NextResponse.next()
  if (request.auth) return NextResponse.next()
  const login = new URL(pathLogin, request.nextUrl.origin)
  login.searchParams.set('redirect', pathname)
  return NextResponse.redirect(login)
})

/** Next 16 edge request gate. Keep federation and public health endpoints outside user auth. */
export default function proxy(request: NextRequest) {
  return isPlexonAuthConfigured() ? gated(request, {} as never) : NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)'] }
