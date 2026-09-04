import { EmptyState, Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'

export const dynamic = 'force-dynamic'

export default function CutsPage() {
  return (
    <AppShell description="Cuts sind die bearbeitbaren Schnittversionen innerhalb einer Collection.">
      <article className="videon-hub">
        <header>
          <p className="videon-spread__eyebrow">Editor</p>
          <h1 className="videon-spread__headline">Cuts</h1>
        </header>
        <EmptyState>
          <Text role="title">Noch keine Cuts</Text>
          <Text role="body">
            Der Editor wird nach der Media-Pipeline freigeschaltet — bis dahin bleibt diese Fläche leer.
          </Text>
        </EmptyState>
      </article>
    </AppShell>
  )
}
