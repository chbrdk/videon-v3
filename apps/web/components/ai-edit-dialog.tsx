'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Stack, Text } from '@msqdx/ui'
import { Dialog } from '@msqdx/ui-client'
import { useT } from '@/lib/user-prefs'
import { formatClock } from '@/lib/editor-time'
import { recommendEditModelId } from '@/lib/generation/recommend'

export type AiEditOptions = {
  startMs: number
  endMs: number
  prompt: string
  modelId: string
  skipDraft: boolean
  keepSourceAudio: boolean
  referenceImageUrls: string[]
}

export type AiEditModelOption = {
  id: string
  label: string
  role: string
  usdPerSecond?: number
}

export type AiEditDialogProps = {
  open: boolean
  busy?: boolean
  startMs: number
  endMs: number
  maxEditMs: number
  models: AiEditModelOption[]
  onClose: () => void
  onConfirm: (options: AiEditOptions) => void | Promise<void>
}

export function AiEditDialog({
  open,
  busy = false,
  startMs,
  endMs,
  maxEditMs,
  models,
  onClose,
  onConfirm,
}: AiEditDialogProps) {
  const t = useT()
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('minimax_hailuo_3_edit')
  const [skipDraft, setSkipDraft] = useState(true)
  const [keepSourceAudio, setKeepSourceAudio] = useState(true)
  const [referenceUrl, setReferenceUrl] = useState('')

  const durationMs = Math.max(0, endMs - startMs)
  const rangeOk = durationMs >= 1000 && durationMs <= maxEditMs
  const promptOk = prompt.trim().length > 0
  const canSubmit = rangeOk && promptOk && !busy

  const modelChoices = useMemo(() => {
    if (models.length) return models
    return [{ id: 'minimax_hailuo_3_edit', label: 'MiniMax H3 Edit', role: 'edit', usdPerSecond: 0.13 }]
  }, [models])

  const seconds = Math.max(1, Math.round(durationMs / 1000))
  const finalRate = modelChoices.find((m) => m.id === modelId)?.usdPerSecond ?? 0.13
  const draftRate = modelChoices.find((m) => m.role === 'draft')?.usdPerSecond ?? 0.13
  const estimateUsd = Number(((skipDraft ? 0 : draftRate * seconds) + finalRate * seconds).toFixed(2))

  useEffect(() => {
    if (!open) return
    setPrompt('')
    setSkipDraft(true)
    setKeepSourceAudio(true)
    setReferenceUrl('')
    setModelId(modelChoices.find((m) => m.role === 'edit')?.id || modelChoices[0]?.id || 'minimax_hailuo_3_edit')
  }, [open, modelChoices])

  const handleConfirm = async () => {
    if (!canSubmit) return
    const refs = referenceUrl.trim() ? [referenceUrl.trim()] : []
    await onConfirm({
      startMs,
      endMs,
      prompt: prompt.trim(),
      modelId,
      skipDraft,
      keepSourceAudio,
      referenceImageUrls: refs,
    })
  }

  const handleClose = () => {
    if (busy) return
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t('aiEdit.title')}
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleClose}>
            {t('aiEdit.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            onClick={() => void handleConfirm()}
          >
            {busy ? t('aiEdit.starting') : t('aiEdit.confirm')}
          </Button>
        </>
      }
    >
      <Stack gap="md">
        <Text role="body" as="p">
          {t('aiEdit.lead')}
        </Text>
        <Text role="body" as="p">
          {t('aiEdit.range')}: {formatClock(startMs)} – {formatClock(endMs)} ({Math.round(durationMs / 100) / 10}s)
          {!rangeOk ? ` · ${t('aiEdit.rangeInvalid', { max: Math.round(maxEditMs / 1000) })}` : ''}
        </Text>
        {durationMs > 0 && durationMs < 4000 ? (
          <Text role="body" as="p">
            {t('aiEdit.rangeExpandHint')}
          </Text>
        ) : null}
        <Field label={t('aiEdit.prompt')}>
          <Input
            value={prompt}
            disabled={busy}
            placeholder={t('aiEdit.promptPlaceholder')}
            onChange={(event) => {
              const next = event.target.value
              setPrompt(next)
              const recommended = recommendEditModelId({
                prompt: next,
                alephAvailable: modelChoices.some((m) => m.id === 'runway_aleph_2'),
                minimaxAvailable: modelChoices.some((m) => m.id === 'minimax_hailuo_3_edit'),
              })
              if (modelChoices.some((m) => m.id === recommended && m.role === 'edit')) {
                setModelId(recommended)
              }
            }}
          />
        </Field>
        <Field label={t('aiEdit.model')}>
          <select
            aria-label={t('aiEdit.model')}
            disabled={busy}
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            style={{ width: '100%', minHeight: '2.25rem' }}
          >
            {modelChoices
              .filter((model) => model.role === 'edit')
              .map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('aiEdit.referenceUrl')}>
          <Input
            value={referenceUrl}
            disabled={busy}
            placeholder="https://"
            onChange={(event) => setReferenceUrl(event.target.value)}
          />
        </Field>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={keepSourceAudio}
            disabled={busy}
            onChange={(event) => setKeepSourceAudio(event.target.checked)}
          />
          <Text role="body" as="span">
            {t('aiEdit.keepAudio')}
          </Text>
        </label>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={skipDraft}
            disabled={busy}
            onChange={(event) => setSkipDraft(event.target.checked)}
          />
          <Text role="body" as="span">
            {t('aiEdit.skipDraft')}
          </Text>
        </label>
        <Text role="body" as="p">
          {t('aiEdit.costEstimate', { usd: estimateUsd.toFixed(2) })}
        </Text>
      </Stack>
    </Dialog>
  )
}
