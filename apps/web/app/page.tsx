import { Text } from '@msqdx/ui'
import { AppShell } from '@/components/app-shell'

export default function HomePage() {
  return (
    <AppShell
      title="VIDEON"
      description="Video-Intelligence und Cuts innerhalb einer PLEXON Collection."
    >
      <Text role="title" as="h2">
        Foundation in progress
      </Text>
      <Text role="body" as="p">
        Federation, sichere Workspace-Provisionierung und die OpenRouter-Policy sind vorbereitet.
        Upload, Analyse und Editor werden erst nach ihren jeweiligen Persistenz- und Security-Gates aktiviert.
      </Text>
    </AppShell>
  )
}
