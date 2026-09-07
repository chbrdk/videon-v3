'use client'

import type { ReactNode } from 'react'
import { InspectTabs, Panel, Text, ToolButton } from '@msqdx/ui'

export type EditorSidePanel = 'scenes' | 'transcript' | 'search' | 'pipeline' | 'bin'

type TabItem = { id: EditorSidePanel; label: ReactNode }

type EditorSideDrawerProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  tabs?: TabItem[]
  activeTab?: EditorSidePanel | null
  onTabChange?: (id: EditorSidePanel) => void
}

export function EditorSideDrawer({
  open,
  title,
  onClose,
  children,
  tabs,
  activeTab,
  onTabChange,
}: EditorSideDrawerProps) {
  if (!open) return null

  return (
    <>
      <button type="button" className="videon-nle__drawer-backdrop" onClick={onClose} aria-label="Panel schließen" />
      <aside className="videon-nle__drawer" role="dialog" aria-modal="true" aria-label={title}>
        <Panel as="div" variant="card" className="videon-nle__drawer-panel">
          <div className="videon-nle__drawer-header">
            <div className="videon-nle__drawer-header-main">
              <Text role="title" as="h3">
                {title}
              </Text>
              {tabs && activeTab && onTabChange ? (
                <InspectTabs
                  aria-label="Editor-Inspect"
                  value={activeTab}
                  onChange={(id) => onTabChange(id as EditorSidePanel)}
                  items={tabs}
                />
              ) : null}
            </div>
            <ToolButton label="Schließen" onClick={onClose}>
              ✕
            </ToolButton>
          </div>
          <div className="videon-nle__drawer-body" role="tabpanel">
            {children}
          </div>
        </Panel>
      </aside>
    </>
  )
}

export function toggleSidePanel(current: EditorSidePanel | null, next: EditorSidePanel): EditorSidePanel | null {
  return current === next ? null : next
}

export function openOrFocusPanel(
  current: EditorSidePanel | null,
  next: EditorSidePanel,
): EditorSidePanel {
  return current === next ? next : next
}
