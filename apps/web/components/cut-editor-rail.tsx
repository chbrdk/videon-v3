'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Panel, Text, ToolButton } from '@msqdx/ui'
import {
  CUT_LEFT_RAIL_KEY,
  CUT_RAIL_LIMITS,
  CUT_RIGHT_RAIL_KEY,
  readCutRailWidth,
  writeCutRailWidth,
} from '@/lib/cut-editor-rails'

type CutEditorRailProps = {
  side: 'left' | 'right'
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  storageKey?: string
  defaultWidth?: number
}

export function CutEditorRail({
  side,
  title,
  open,
  onClose,
  children,
  storageKey = side === 'left' ? CUT_LEFT_RAIL_KEY : CUT_RIGHT_RAIL_KEY,
  defaultWidth = side === 'left' ? CUT_RAIL_LIMITS.leftDefault : CUT_RAIL_LIMITS.rightDefault,
}: CutEditorRailProps) {
  const [widthPx, setWidthPx] = useState(defaultWidth)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setWidthPx(readCutRailWidth(storageKey, defaultWidth))
  }, [open, storageKey, defaultWidth])

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { startX: event.clientX, startWidth: widthPx }
    },
    [widthPx],
  )

  const onResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const delta = side === 'left' ? event.clientX - drag.startX : drag.startX - event.clientX
      const next = Math.min(
        CUT_RAIL_LIMITS.max,
        Math.max(CUT_RAIL_LIMITS.min, Math.round(drag.startWidth + delta)),
      )
      setWidthPx(next)
    },
    [side],
  )

  const onResizePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragRef.current) return
      dragRef.current = null
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* noop */
      }
      setWidthPx((current) => {
        writeCutRailWidth(storageKey, current)
        return current
      })
    },
    [storageKey],
  )

  if (!open) return null

  return (
    <aside
      className={`videon-cut-rail videon-cut-rail--${side}`}
      style={{ width: `${widthPx}px` }}
      aria-label={title}
      data-testid={`cut-rail-${side}`}
    >
      <div className="videon-cut-rail__chrome">
        <div className="videon-cut-rail__toolbar">
          <Text role="label">{title}</Text>
          <ToolButton label="Schließen" onClick={onClose}>
            ×
          </ToolButton>
        </div>
        <Panel title={title} className="videon-cut-rail__panel">
          <div className="videon-cut-rail__body">{children}</div>
        </Panel>
      </div>
      <button
        type="button"
        className={`videon-cut-rail__resize videon-cut-rail__resize--${side === 'left' ? 'e' : 'w'}`}
        aria-label="Breite anpassen"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
      />
    </aside>
  )
}
