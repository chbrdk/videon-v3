'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Stack, Text } from '@msqdx/ui'
import { Dialog } from '@msqdx/ui-client'
import {
  ANALYSIS_USER_BUNDLES,
  type AnalysisUserBundleId,
  normalizeRequestedCapabilities,
} from '@/lib/pipeline/constants'

const DEFAULT_SELECTION: Record<AnalysisUserBundleId, boolean> = {
  vision: true,
  transcript: true,
  stems: true,
  aggregate: true,
}

export type AnalysisOptionsDialogProps = {
  open: boolean
  busy?: boolean
  onClose: () => void
  onConfirm: (capabilities: string[]) => void | Promise<void>
}

export function AnalysisOptionsDialog({ open, busy = false, onClose, onConfirm }: AnalysisOptionsDialogProps) {
  const [selected, setSelected] = useState<Record<AnalysisUserBundleId, boolean>>(DEFAULT_SELECTION)

  useEffect(() => {
    if (open) setSelected(DEFAULT_SELECTION)
  }, [open])

  const selectedBundleIds = useMemo(
    () => ANALYSIS_USER_BUNDLES.filter((bundle) => selected[bundle.id]).map((bundle) => bundle.id),
    [selected],
  )

  const canSubmit = selectedBundleIds.length > 0 && !busy

  const toggle = (id: AnalysisUserBundleId) => {
    setSelected((current) => ({ ...current, [id]: !current[id] }))
  }

  const handleConfirm = async () => {
    if (!canSubmit) return
    const capabilities = normalizeRequestedCapabilities(selectedBundleIds)
    await onConfirm(capabilities)
  }

  const handleClose = () => {
    if (busy) return
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Analyse starten"
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleClose}>
            Abbrechen
          </Button>
          <Button type="button" variant="primary" size="sm" disabled={!canSubmit} onClick={() => void handleConfirm()}>
            {busy ? 'Startet …' : 'Analyse starten'}
          </Button>
        </>
      }
    >
      <Stack gap="md">
        <Text role="body" as="p">
          Wähle, was für dieses Medium analysiert werden soll. Technische Basis (Metadaten) läuft immer mit.
        </Text>
        <Stack gap="sm">
          {ANALYSIS_USER_BUNDLES.map((bundle) => (
            <div key={bundle.id}>
              <Checkbox
                id={`analysis-bundle-${bundle.id}`}
                label={bundle.label}
                checked={selected[bundle.id]}
                disabled={busy}
                onChange={() => toggle(bundle.id)}
              />
              <Text role="meta" as="p">
                {bundle.description}
              </Text>
            </div>
          ))}
        </Stack>
        {selectedBundleIds.length === 0 ? (
          <Text role="meta" as="p">
            Mindestens eine Option muss aktiv sein.
          </Text>
        ) : null}
      </Stack>
    </Dialog>
  )
}
