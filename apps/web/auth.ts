import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { authSecret } from './lib/auth-secret'
import { pathLogin } from './lib/paths'
import { isPlexonAuthConfigured, validateCredentialsWithPlexon } from './lib/plexon-auth'

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: authSecret(),
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !isPlexonAuthConfigured()) return null
        const user = await validateCredentialsWithPlexon(String(credentials.email), String(credentials.password))
        return user ? { id: user.id, email: user.email, name: user.name ?? undefined } : null
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: pathLogin },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        token.email = user.email
        token.name = user.name
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.email = token.email ?? ''
        session.user.name = token.name ?? null
      }
      return session
    },
  },
})
