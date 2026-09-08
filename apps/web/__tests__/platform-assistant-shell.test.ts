import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('videon platform assistant shell mount', () => {
  it('AppShell mounts host and paths document env key', () => {
    const root = join(__dirname, '..')
    const shell = readFileSync(join(root, 'components/app-shell.tsx'), 'utf8')
    const host = readFileSync(join(root, 'components/platform-assistant-host.tsx'), 'utf8')
    const paths = readFileSync(join(root, 'lib/paths.ts'), 'utf8')
    expect(shell).toContain('PlatformAssistantHost')
    expect(shell).toContain('platformProjectId={platformProjectId}')
    expect(shell).toContain('ShellBrandCorner')
    expect(host).toContain('postPlatformAssistantTheme')
    expect(host).toContain('headerActions')
    expect(host).toContain("ASSISTANT_EMBED_PRODUCT")
    expect(paths).toContain('envPlexonPublicUrl')
    expect(paths).toContain('NEXT_PUBLIC_PLEXON_URL')
    expect(paths).toContain('pathAssistantEmbed')
    expect(paths).toContain('ecosystemStagingPlexon')
  })
})
