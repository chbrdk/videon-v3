import { LoginForm } from '@/components/login-form'
import { isPlexonAuthConfigured } from '@/lib/plexon-auth'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return <LoginForm plexonConfigured={isPlexonAuthConfigured()} />
}
