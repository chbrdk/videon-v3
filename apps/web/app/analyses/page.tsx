import { EmptyState, Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'

export const dynamic = 'force-dynamic'

export default function AnalysesPage() {
  return (
    <AppShell description="Durable Vision-Runs mit OpenRouter — Schema-validiert und Collection-scoped.">
      <article className="videon-hub">
        <header>
          <p className="videon-spread__eyebrow">Vision</p>
          <h1 className="videon-spread__headline">Analysen</h1>
        </header>
        <EmptyState>
          <Text role="title">Noch keine Analysen</Text>
          <Text role="body">
            Analyse-Jobs starten, sobald Medien vorhanden sind und die Queue-Gates freigegeben wurden.
          </Text>
        </EmptyState>
      </article>
    </AppShell>
  )
}
