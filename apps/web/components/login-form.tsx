'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button, Field, Input, Panel, SectionChrome, Text } from '@msqdx/ui'

export function LoginForm({ plexonConfigured }: { plexonConfigured: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const redirect = params.get('redirect') || '/'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!plexonConfigured) return
    setLoading(true)
    setError(null)
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl: redirect,
    })
    setLoading(false)
    if (!result?.ok) {
      setError('Anmeldung bei PLEXON fehlgeschlagen.')
      return
    }
    router.replace(redirect)
    router.refresh()
  }

  return (
    <main className="videon-login">
      <Panel className="videon-login__panel">
        <SectionChrome title="VIDEON anmelden" meta="PLEXON Identity" />
        {!plexonConfigured ? (
          <Text role="body">PLEXON Auth ist in dieser Umgebung noch nicht konfiguriert.</Text>
        ) : (
          <form onSubmit={submit} className="videon-login-form">
            {error ? <Text role="body">{error}</Text> : null}
            <Field label="E-Mail" size="md">
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                block
              />
            </Field>
            <Field label="Passwort" size="md">
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
                block
              />
            </Field>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Anmelden …' : 'Mit PLEXON anmelden'}
            </Button>
          </form>
        )}
      </Panel>
    </main>
  )
}
