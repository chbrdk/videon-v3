'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
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

const WIDTH_STORAGE_KEY = 'videon.editor.drawerWidthPx'
const DEFAULT_WIDTH_PX = 384
const MIN_WIDTH_PX = 280

function maxWidthPx(): number {
  if (typeof window === 'undefined') return 720
  return Math.min(720, Math.floor(window.innerWidth * 0.92))
}

function clampWidth(px: number): number {
  return Math.min(maxWidthPx(), Math.max(MIN_WIDTH_PX, Math.round(px)))
}

function readStoredWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH_PX
  const raw = window.sessionStorage.getItem(WIDTH_STORAGE_KEY)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_WIDTH_PX
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
  const [widthPx, setWidthPx] = useState(DEFAULT_WIDTH_PX)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setWidthPx(readStoredWidth())
  }, [open])

  const onResizePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    dragRef.current = { startX: event.clientX, startWidth: widthPx }
  }, [widthPx])

  const onResizePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag) return
    // Drawer is right-docked: drag left → wider
    const next = clampWidth(drag.startWidth + (drag.startX - event.clientX))
    setWidthPx(next)
  }, [])

  const onResizePointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    setWidthPx((current) => {
      const next = clampWidth(current)
      window.sessionStorage.setItem(WIDTH_STORAGE_KEY, String(next))
      return next
    })
  }, [])

  if (!open) return null

  return (
    <>
      <button type="button" className="videon-nle__drawer-backdrop" onClick={onClose} aria-label="Panel schließen" />
      <aside
        className="videon-nle__drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width: `${widthPx}px` }}
      >
        <button
          type="button"
          className="videon-nle__drawer-resize"
          aria-label="Inspect-Breite ändern"
          title="Breite ziehen"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />
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
