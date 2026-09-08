'use client'

import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import {
  Alert,
  Button,
  EmptyState,
  Field,
  LoadingText,
  Text,
  Textarea,
} from '@msqdx/ui'
import { SceneSearchHitStrip } from '@/components/scene-search-hit-strip'
import { paths } from '@/lib/paths'
import { useT } from '@/lib/user-prefs'

type SearchHit = {
  id: string
  mediaAssetId: string
  sceneKey: string | null
  searchText: string
  mediaFilename: string
  startMs: number | null
  endMs: number | null
  platformProjectId?: string
  projectName?: string | null
}

type ChatTurn =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; hits?: SearchHit[] }

export function SceneChatWorkspace() {
  const t = useT()
  const [draft, setDraft] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  async function runSearch(query: string) {
    const trimmed = query.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    const userTurn: ChatTurn = { id: `u-${Date.now()}`, role: 'user', text: trimmed }
    setTurns((prev) => [...prev, userTurn])
    setDraft('')
    try {
      const response = await fetch(paths.routes.apiMediaSearchAccessible(trimmed), { cache: 'no-store' })
      const body = (await response.json()) as {
        items?: SearchHit[]
        terms?: string[]
        error?: { message?: string }
      }
      if (!response.ok) throw new Error(body.error?.message || t('chat.searchFailed'))
      const hits = body.items ?? []
      const terms = body.terms?.slice(0, 8) ?? []
      const termsHint = terms.length ? ` (${terms.join(', ')})` : ''
      const assistant: ChatTurn = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text:
          hits.length === 0
            ? t('chat.noHits', { query: trimmed }) +
              (termsHint ? ` ${t('chat.triedTerms', { terms: terms.join(', ') })}` : '')
            : t('chat.hitCount', { count: hits.length, query: trimmed }),
        hits: hits.length > 0 ? hits : undefined,
      }
      setTurns((prev) => [...prev, assistant])
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chat.searchFailed'))
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void runSearch(draft)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void runSearch(draft)
    }
  }

  return (
    <section className="chat-panel chat-panel-open videon-chat-panel" aria-label={t('chat.aria')}>
      <div className="chat-turns">
        {turns.length === 0 ? (
          <EmptyState className="chat-empty">
            <Text role="title">{t('chat.emptyTitle')}</Text>
            <Text role="body">{t('chat.emptyBody')}</Text>
          </EmptyState>
        ) : (
          turns.map((turn) =>
            turn.role === 'user' ? (
              <div key={turn.id} className="chat-turn chat-turn-user">
                <Text role="body" as="p">
                  {turn.text}
                </Text>
              </div>
            ) : (
              <div key={turn.id} className="chat-turn chat-turn-assistant">
                <Text role="body" as="p">
                  {turn.text}
                </Text>
                {turn.hits?.length ? (
                  <SceneSearchHitStrip
                    hits={turn.hits
                      .filter((hit): hit is SearchHit & { platformProjectId: string } =>
                        Boolean(hit.platformProjectId),
                      )
                      .map((hit) => ({
                        ...hit,
                        platformProjectId: hit.platformProjectId,
                      }))}
                  />
                ) : null}
              </div>
            ),
          )
        )}
        {busy ? <LoadingText>{t('chat.searching')}</LoadingText> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div ref={bottomRef} />
      </div>

      <form className="chat-form" onSubmit={onSubmit}>
        <Field label={t('chat.composerLabel')} htmlFor="videon-scene-chat-composer">
          <Textarea
            id="videon-scene-chat-composer"
            className="chat-composer"
            value={draft}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('chat.placeholder')}
            rows={2}
            disabled={busy}
          />
        </Field>
        <Button type="submit" className="chat-send" disabled={busy || !draft.trim()} variant="primary">
          {t('chat.send')}
        </Button>
      </form>
    </section>
  )
}
