'use client'

/**
 * Collection team aside — PLEXON is SSOT for Access Model B assignments.
 * Compact magazine rows with an inline draft email row (no persistent Field) and an
 * invite link as secondary foot action. Spec: `specs/domain/project-team.md`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, EmptyState, Panel, SectionChrome, Text } from '@msqdx/ui'
import { paths } from '@/lib/paths'
import { isRealPlatformProjectId } from '@/lib/plexon-platform-id'
import { useT } from '@/lib/user-prefs'

type TeamRow = {
  id: string
  email: string
  role: string
  status: string
}

type TeamResponseBody = {
  items?: TeamRow[]
  inviteUrl?: string
  emailedTo?: string
  error?: { message?: string }
}

async function readBody(response: Response): Promise<TeamResponseBody> {
  return (await response.json().catch(() => ({}))) as TeamResponseBody
}

export function CollectionTeamPanel({
  platformProjectId,
}: {
  platformProjectId: string | null | undefined
}) {
  const t = useT()
  const bound = isRealPlatformProjectId(platformProjectId)
  const collectionId = platformProjectId?.trim() ?? ''
  const [items, setItems] = useState<TeamRow[]>([])
  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const skipBlurSave = useRef(false)

  const reload = useCallback(async () => {
    if (!bound) return
    try {
      const response = await fetch(paths.routes.apiCollectionMembers(collectionId), {
        cache: 'no-store',
      })
      const body = await readBody(response)
      if (!response.ok) {
        setError(body.error?.message || t('collections.team.loadError'))
        return
      }
      setItems(body.items ?? [])
      setError(null)
    } catch {
      setError(t('collections.team.loadError'))
    }
  }, [bound, collectionId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!draftOpen) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [draftOpen])

  function beginDraft() {
    if (busy || draftOpen) return
    setDraftOpen(true)
    setDraft('')
    setError(null)
    setStatus(null)
  }

  function cancelDraft() {
    skipBlurSave.current = true
    setDraftOpen(false)
    setDraft('')
  }

  async function commitDraft() {
    const trimmed = draft.trim()
    if (!trimmed) {
      setDraftOpen(false)
      setDraft('')
      return
    }
    if (busy) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const response = await fetch(paths.routes.apiCollectionMembers(collectionId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, role: 'member' }),
      })
      const body = await readBody(response)
      if (!response.ok) {
        const message = body.error?.message ?? ''
        if (message === 'user_not_found' || message === 'wrong_company') {
          throw new Error(t('collections.team.userMissing'))
        }
        throw new Error(message || t('collections.team.addError'))
      }
      setDraftOpen(false)
      setDraft('')
      setStatus(t('collections.team.added'))
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('collections.team.addError'))
    } finally {
      setBusy(false)
    }
  }

  async function onInviteLink() {
    const toEmail = draft.trim() || undefined
    skipBlurSave.current = true
    setBusy(true)
    setError(null)
    setInviteUrl(null)
    setStatus(null)
    try {
      const response = await fetch(paths.routes.apiCollectionInvites(collectionId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'member',
          ...(toEmail ? { toEmail } : {}),
        }),
      })
      const body = await readBody(response)
      if (!response.ok) throw new Error(body.error?.message || t('collections.team.inviteError'))
      const url = body.inviteUrl ?? ''
      setInviteUrl(url)
      if (body.emailedTo) {
        setStatus(t('collections.team.inviteEmailed', { email: body.emailedTo }))
        setDraftOpen(false)
        setDraft('')
      } else if (url && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setStatus(t('collections.team.inviteCopied'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('collections.team.inviteError'))
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(userId: string) {
    if (busy || draftOpen) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(paths.routes.apiCollectionMember(collectionId, userId), {
        method: 'DELETE',
      })
      if (!response.ok) {
        const body = await readBody(response)
        throw new Error(body.error?.message || t('collections.team.removeError'))
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('collections.team.removeError'))
    } finally {
      setBusy(false)
    }
  }

  if (!bound) {
    return (
      <Panel className="videon-collection-team">
        <SectionChrome quiet title={t('collections.team.title')} meta="—" as="h3" />
        <EmptyState>{t('collections.team.needsCollection')}</EmptyState>
      </Panel>
    )
  }

  const nextNum = String(items.length + (draftOpen ? 1 : 0) + 1).padStart(2, '0')
  const showList = items.length > 0 || draftOpen

  return (
    <Panel className="videon-collection-team">
      <SectionChrome
        quiet
        title={t('collections.team.title')}
        meta={`${items.length}`}
        as="h3"
      />

      {showList ? (
        <ol className="videon-collection-team__items">
          {items.map((member, index) => (
            <li key={member.id} className="videon-collection-team__row">
              <span className="videon-collection-team__num" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="videon-collection-team__main">
                <span className="videon-collection-team__email">{member.email}</span>
                <span className="videon-collection-team__meta">
                  {member.role} · {member.status}
                </span>
              </div>
              {member.status !== 'owner' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="videon-collection-team__delete"
                  aria-label={t('collections.team.remove')}
                  disabled={busy}
                  onClick={() => void onRemove(member.id)}
                >
                  ×
                </Button>
              ) : (
                <span aria-hidden />
              )}
            </li>
          ))}
          {draftOpen ? (
            <li className="videon-collection-team__row">
              <span className="videon-collection-team__num" aria-hidden>
                {String(items.length + 1).padStart(2, '0')}
              </span>
              <div className="videon-collection-team__main">
                <input
                  ref={inputRef}
                  className="videon-collection-team__input"
                  type="email"
                  value={draft}
                  disabled={busy}
                  placeholder={t('collections.team.addPlaceholder')}
                  aria-label={t('collections.team.add')}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => {
                    if (skipBlurSave.current) {
                      skipBlurSave.current = false
                      return
                    }
                    void commitDraft()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void commitDraft()
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelDraft()
                    }
                  }}
                />
              </div>
            </li>
          ) : null}
        </ol>
      ) : (
        <EmptyState>{t('collections.team.empty')}</EmptyState>
      )}

      <div className="videon-collection-team__foot">
        <button
          type="button"
          className="videon-collection-team__add"
          aria-label={t('collections.team.add')}
          disabled={busy || draftOpen}
          onClick={beginDraft}
        >
          <span className="videon-collection-team__num" aria-hidden>
            {nextNum}
          </span>
          <span>{t('collections.team.add')}</span>
        </button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void onInviteLink()}
        >
          {t('collections.team.inviteLink')}
        </Button>
      </div>

      {error ? (
        <Text role="meta" as="p">
          {error}
        </Text>
      ) : null}
      {status ? (
        <p className="videon-collection-team__status" role="status">
          {status}
        </p>
      ) : null}
      {inviteUrl ? (
        <Text role="meta" as="p">
          <a href={inviteUrl}>{inviteUrl}</a>
        </Text>
      ) : null}
    </Panel>
  )
}
