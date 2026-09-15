'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Stack, Text } from '@msqdx/ui'
import { Dialog } from '@msqdx/ui-client'
import { estimateGenerationCostUsd } from '@/lib/generation/model-catalog'
import { useT } from '@/lib/user-prefs'
import { recommendCreateModelId } from '@/lib/generation/recommend'

export type AiCreateOptions = {
  prompt: string
  modelId: string
  durationSeconds: number
  aspectRatio: '16:9' | '9:16' | '1:1'
  referenceImageUrls: string[]
}

export type AiCreateModelOption = {
  id: string
  label: string
  role: string
  usdPerSecond?: number
}

export type AiCreateDialogProps = {
  open: boolean
  busy?: boolean
  models: AiCreateModelOption[]
  onClose: () => void
  onConfirm: (options: AiCreateOptions) => void | Promise<void>
}

export function AiCreateDialog({
  open,
  busy = false,
  models,
  onClose,
  onConfirm,
}: AiCreateDialogProps) {
  const t = useT()
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('seedance_2_5_t2v')
  const [durationSeconds, setDurationSeconds] = useState('5')
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9')
  const [referenceUrl, setReferenceUrl] = useState('')

  const modelChoices = useMemo(() => {
    if (models.length) return models
    return [{ id: 'seedance_2_5_t2v', label: 'Seedance 2.5 T2V', role: 'create', usdPerSecond: 0.1 }]
  }, [models])

  const duration = Math.min(30, Math.max(4, Number.parseInt(durationSeconds, 10) || 5))
  const estimate = estimateGenerationCostUsd({
    modelId,
    durationSeconds: duration,
    skipDraft: true,
  })
  const canSubmit = prompt.trim().length > 0 && !busy

  useEffect(() => {
    if (!open) return
    setPrompt('')
    setDurationSeconds('5')
    setAspectRatio('16:9')
    setReferenceUrl('')
    setModelId(modelChoices[0]?.id || 'seedance_2_5_t2v')
  }, [open, modelChoices])

  const handleConfirm = async () => {
    if (!canSubmit) return
    await onConfirm({
      prompt: prompt.trim(),
      modelId,
      durationSeconds: duration,
      aspectRatio,
      referenceImageUrls: referenceUrl.trim() ? [referenceUrl.trim()] : [],
    })
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      title={t('aiCreate.title')}
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            {t('aiCreate.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            onClick={() => void handleConfirm()}
          >
            {busy ? t('aiCreate.starting') : t('aiCreate.confirm')}
          </Button>
        </>
      }
    >
      <Stack gap="md">
        <Text role="body" as="p">
          {t('aiCreate.lead')}
        </Text>
        <Field label={t('aiCreate.prompt')}>
          <Input
            value={prompt}
            disabled={busy}
            placeholder={t('aiCreate.promptPlaceholder')}
            onChange={(event) => {
              const next = event.target.value
              setPrompt(next)
              const recommended = recommendCreateModelId(next)
              if (modelChoices.some((m) => m.id === recommended)) setModelId(recommended)
            }}
          />
        </Field>
        <Field label={t('aiCreate.model')}>
          <select
            aria-label={t('aiCreate.model')}
            disabled={busy}
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            style={{ width: '100%', minHeight: '2.25rem' }}
          >
            {modelChoices.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('aiCreate.duration')}>
          <Input
            type="number"
            min={4}
            max={30}
            value={durationSeconds}
            disabled={busy}
            onChange={(event) => setDurationSeconds(event.target.value)}
          />
        </Field>
        <Field label={t('aiCreate.aspect')}>
          <select
            aria-label={t('aiCreate.aspect')}
            disabled={busy}
            value={aspectRatio}
            onChange={(event) => setAspectRatio(event.target.value as '16:9' | '9:16' | '1:1')}
            style={{ width: '100%', minHeight: '2.25rem' }}
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
        </Field>
        <Field label={t('aiCreate.referenceUrl')}>
          <Input
            value={referenceUrl}
            disabled={busy}
            placeholder="https://"
            onChange={(event) => setReferenceUrl(event.target.value)}
          />
        </Field>
        <Text role="body" as="p">
          {t('aiCreate.costEstimate', { usd: estimate.totalUsd.toFixed(2) })}
        </Text>
      </Stack>
    </Dialog>
  )
}
