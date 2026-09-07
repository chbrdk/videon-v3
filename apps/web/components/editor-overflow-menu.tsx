'use client'

import type { ReactNode } from 'react'
import { Button } from '@msqdx/ui'
import { useFlyout } from '@msqdx/ui-client'

/**
 * Toolbar overflow — DS Flyout pattern (useFlyout + Button + ds-flyover).
 * Replaces native `<details>` / custom `.videon-nle__toolbar-menu`.
 * ContextMenu stays for pointer-positioned right-click menus, not toolbar overflow.
 */
export function EditorOverflowMenu({
  label = 'Mehr',
  disabled = false,
  children,
}: {
  label?: string
  disabled?: boolean
  children: (ctx: { close: () => void }) => ReactNode
}) {
  const { open, setOpen, rootRef, toggle } = useFlyout()

  return (
    <div className="ds-flyout videon-nle__overflow" ref={rootRef}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        className={open ? 'is-active' : undefined}
        onClick={toggle}
      >
        {label}
      </Button>
      {open ? (
        <div
          className="ds-flyover ds-motion-reveal videon-nle__overflow-panel"
          role="menu"
          aria-label={label}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      ) : null}
    </div>
  )
}

export function EditorOverflowItem({
  children,
  onClick,
  disabled,
  close,
  danger = false,
  href,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  close: () => void
  danger?: boolean
  href?: string
}) {
  if (href) {
    return (
      <Button
        href={href}
        variant="ghost"
        size="sm"
        block
        className="videon-nle__overflow-item"
        onClick={() => close()}
      >
        {children}
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant={danger ? 'danger' : 'ghost'}
      size="sm"
      block
      disabled={disabled}
      className="videon-nle__overflow-item"
      role="menuitem"
      onClick={() => {
        onClick?.()
        close()
      }}
    >
      {children}
    </Button>
  )
}
