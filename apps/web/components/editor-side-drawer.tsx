'use client'

import type { ReactNode } from 'react'

type EditorSideDrawerProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

export function EditorSideDrawer({ open, title, onClose, children }: EditorSideDrawerProps) {
  if (!open) return null

  return (
    <>
      <button type="button" className="videon-nle__drawer-backdrop" onClick={onClose} aria-label="Panel schließen" />
      <aside className="videon-nle__drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="videon-nle__drawer-header">
          <h3>{title}</h3>
          <button type="button" className="videon-nle__tool-btn" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="videon-nle__drawer-body">{children}</div>
      </aside>
    </>
  )
}

export type EditorSidePanel = 'scenes' | 'transcript' | 'search' | 'pipeline' | 'bin'

export function toggleSidePanel(current: EditorSidePanel | null, next: EditorSidePanel): EditorSidePanel | null {
  return current === next ? null : next
}
