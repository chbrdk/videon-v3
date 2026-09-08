'use client'

import { useState } from 'react'
import { Button, Field, Input, SettingsBand, Text } from '@msqdx/ui'
import type { ApiTokenStub } from '@videon-v3/contracts'
import { paths } from '@/lib/paths'
import { useT } from '@/lib/user-prefs'

export function SettingsTokens({ tokens: initialTokens }: { tokens: ApiTokenStub[] }) {
  const t = useT()
  const [tokens, setTokens] = useState(initialTokens)
  const [label, setLabel] = useState('')
  const [rawSecret, setRawSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const res = await fetch(paths.routes.apiTokens)
    if (!res.ok) return
    const body = (await res.json()) as { items?: ApiTokenStub[] }
    setTokens(body.items ?? [])
  }

  async function createToken() {
    setBusy(true)
    setError(null)
    setRawSecret(null)
    try {
      const res = await fetch(paths.routes.apiTokens, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || undefined }),
      })
      if (!res.ok) {
        setError(t('settings.createFailed'))
        return
      }
      const created = (await res.json()) as ApiTokenStub & { token: string }
      setRawSecret(created.token)
      setLabel('')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function revokeToken(tokenId: string) {
    if (!window.confirm(t('settings.revokeConfirm'))) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(paths.routes.apiTokenDetail(tokenId), { method: 'DELETE' })
      if (!res.ok) {
        setError(t('settings.revokeFailed'))
        return
      }
      if (rawSecret) setRawSecret(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsBand
      title={t('settings.apiTokens')}
      help={t('settings.apiTokensHelp', { prefix: paths.apiTokenPrefix })}
      data-testid="settings-tokens"
    >
      {rawSecret ? (
        <div className="videon-settings-token-reveal">
          <Text role="title">{t('settings.tokenRevealTitle')}</Text>
          <code className="videon-settings-token-code">{rawSecret}</code>
          <Button type="button" variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(rawSecret)}>
            {t('settings.copyToken')}
          </Button>
          <Text role="meta" as="p">
            {t('settings.tokenRevealHint')}
          </Text>
        </div>
      ) : null}
      {error ? (
        <Text role="body" as="p" className="videon-settings-token-error">
          {error}
        </Text>
      ) : null}
      <Field label={t('settings.tokenLabel')} htmlFor="videon-token-label">
        <Input
          id="videon-token-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('settings.tokenLabelPlaceholder')}
          disabled={busy}
        />
      </Field>
      <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => void createToken()}>
        {t('settings.createToken')}
      </Button>
      {tokens.length === 0 ? (
        <Text role="meta" as="p">
          {t('settings.noTokens')}
        </Text>
      ) : (
        <ul className="videon-settings-token-list">
          {tokens.map((tok) => (
            <li key={tok.id}>
              <div>
                <Text role="body" as="span">
                  {tok.label}
                </Text>
                <Text role="meta" as="span">
                  {' '}
                  · {tok.prefix}…
                </Text>
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void revokeToken(tok.id)}>
                {t('settings.revokeToken')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SettingsBand>
  )
}
