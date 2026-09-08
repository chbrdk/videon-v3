import type { ReactNode } from 'react'
import { Text } from '@msqdx/ui'

/** Shared hub page header — DS Text roles instead of .videon-spread__*. */
export function HubPageHeader({
  eyebrow,
  title,
  deck,
  actions,
}: {
  eyebrow?: string
  title: string
  deck?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="videon-hub__header-row">
      <div>
        {eyebrow ? (
          <Text role="meta" as="p" className="videon-hub__eyebrow">
            {eyebrow}
          </Text>
        ) : null}
        <Text role="display" as="h1" className="videon-hub__title">
          {title}
        </Text>
        {deck != null ? (
          <Text role="body" as="p" className="videon-hub__deck">
            {deck}
          </Text>
        ) : null}
      </div>
      {actions != null ? <div className="videon-hub__actions">{actions}</div> : null}
    </header>
  )
}
