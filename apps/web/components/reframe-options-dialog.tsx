'use client'

import { useEffect, useState } from 'react'
import { Button, Field, Input, Stack, Text } from '@msqdx/ui'
import { Dialog } from '@msqdx/ui-client'
import type { MediaReframeAspect } from '@/lib/db/media-reframes'
import { AspectPresetChips } from '@/components/aspect-preset-chips'
import { useT } from '@/lib/user-prefs'

export type ReframeOptions = {
  aspectRatio: MediaReframeAspect
  smoothingFactor: number
  customWidth?: number
  customHeight?: number
}

export type ReframeOptionsDialogProps = {
  open: boolean
  busy?: boolean
  onClose: () => void
  onConfirm: (options: ReframeOptions) => void | Promise<void>
}

export function ReframeOptionsDialog({ open, busy = false, onClose, onConfirm }: ReframeOptionsDialogProps) {
  const t = useT()
  const [aspectRatio, setAspectRatio] = useState<MediaReframeAspect>('9:16')
  const [smoothingFactor, setSmoothingFactor] = useState(0.3)
  const [customWidth, setCustomWidth] = useState('1080')
  const [customHeight, setCustomHeight] = useState('1920')

  const presets: Array<{ value: MediaReframeAspect; label: string }> = [
    { value: '9:16', label: '9:16' },
    { value: '16:9', label: '16:9' },
    { value: '1:1', label: '1:1' },
    { value: 'custom', label: t('reframe.custom') },
  ]

  useEffect(() => {
    if (open) {
      setAspectRatio('9:16')
      setSmoothingFactor(0.3)
      setCustomWidth('1080')
      setCustomHeight('1920')
    }
  }, [open])

  const customOk =
    aspectRatio !== 'custom' ||
    (Number.parseInt(customWidth, 10) > 0 && Number.parseInt(customHeight, 10) > 0)
  const canSubmit = customOk && !busy

  const handleConfirm = async () => {
    if (!canSubmit) return
    await onConfirm({
      aspectRatio,
      smoothingFactor,
      ...(aspectRatio === 'custom'
        ? {
            customWidth: Number.parseInt(customWidth, 10),
            customHeight: Number.parseInt(customHeight, 10),
          }
        : {}),
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
      title={t('reframe.title')}
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleClose}>
            {t('reframe.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            onClick={() => void handleConfirm()}
          >
            {busy ? t('reframe.starting') : t('reframe.confirm')}
          </Button>
        </>
      }
    >
      <Stack gap="md">
        <Text role="body" as="p">
          {t('reframe.lead')}
        </Text>
        <Field label={t('reframe.aspect')}>
          <AspectPresetChips
            ariaLabel={t('reframe.aspect')}
            value={aspectRatio}
            disabled={busy}
            options={presets}
            onChange={setAspectRatio}
          />
        </Field>
        {aspectRatio === 'custom' ? (
          <Stack gap="sm">
            <Field label={t('reframe.customWidth')}>
              <Input
                type="number"
                min={2}
                max={3840}
                value={customWidth}
                disabled={busy}
                onChange={(event) => setCustomWidth(event.target.value)}
              />
            </Field>
            <Field label={t('reframe.customHeight')}>
              <Input
                type="number"
                min={2}
                max={3840}
                value={customHeight}
                disabled={busy}
                onChange={(event) => setCustomHeight(event.target.value)}
              />
            </Field>
          </Stack>
        ) : null}
        <Field label={`${t('reframe.smoothing')} (${smoothingFactor.toFixed(2)})`}>
          <Input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={smoothingFactor}
            disabled={busy}
            onChange={(event) => setSmoothingFactor(Number(event.target.value))}
          />
        </Field>
      </Stack>
    </Dialog>
  )
}
