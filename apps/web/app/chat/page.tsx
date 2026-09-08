import { AppShell } from '@/components/app-shell'
import { SceneChatWorkspace } from '@/components/scene-chat-workspace'

export const dynamic = 'force-dynamic'

export default function ChatPage() {
  return (
    <AppShell>
      <SceneChatWorkspace />
    </AppShell>
  )
}
