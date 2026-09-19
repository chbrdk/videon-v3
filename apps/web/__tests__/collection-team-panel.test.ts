import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTranslator } from '@/lib/i18n'
import { paths } from '@/lib/paths'
import { isRealPlatformProjectId } from '@/lib/plexon-platform-id'

const webRoot = join(__dirname, '..')

function read(relativePath: string) {
  return readFileSync(join(webRoot, relativePath), 'utf8')
}

describe('CollectionTeamPanel', () => {
  it('uses a magazine add-row draft instead of a persistent Field', () => {
    const panel = read('components/collection-team-panel.tsx')
    expect(panel).toMatch(/export function CollectionTeamPanel/)
    expect(panel).not.toMatch(/<Field\b/)
    expect(panel).not.toMatch(/^import \{[^}]*\bField\b/m)
    expect(panel).toMatch(/draftOpen/)
    expect(panel).toMatch(/videon-collection-team__input/)
    expect(panel).toMatch(/collections\.team\.addPlaceholder/)
    expect(panel).toMatch(/event\.key === 'Enter'/)
    expect(panel).toMatch(/event\.key === 'Escape'/)
    expect(panel).toMatch(/collections\.team\.inviteLink/)
  })

  it('hides the roster and actions until a Collection is active', () => {
    const panel = read('components/collection-team-panel.tsx')
    expect(panel).toMatch(/const bound = isRealPlatformProjectId\(platformProjectId\)/)
    expect(panel).toMatch(/collections\.team\.needsCollection/)
    expect(isRealPlatformProjectId('plx-local-demo')).toBe(false)
    expect(isRealPlatformProjectId('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBe(true)
  })

  it('omits the remove action for the Collection creator row', () => {
    const panel = read('components/collection-team-panel.tsx')
    expect(panel).toMatch(/member\.status !== 'owner'/)
  })

  it('rides the Projekte hub as a thin aside bound to the active Collection', () => {
    const hub = read('components/collections-switcher-hub.tsx')
    expect(hub).toMatch(/CollectionTeamPanel/)
    expect(hub).toMatch(/useActiveCollection/)
    expect(hub).toMatch(/platformProjectId=\{platformProjectId\}/)
    expect(hub).toMatch(/videon-hub__aside/)

    const css = read('app/globals.css')
    expect(css).toMatch(/\.videon-hub__with-aside\b/)
    expect(css).toMatch(/\.videon-collection-team\b/)
  })

  it('reaches the BFF through central path helpers only', () => {
    const panel = read('components/collection-team-panel.tsx')
    expect(panel).toMatch(/paths\.routes\.apiCollectionMembers\(collectionId\)/)
    expect(panel).toMatch(/paths\.routes\.apiCollectionMember\(collectionId, userId\)/)
    expect(panel).toMatch(/paths\.routes\.apiCollectionInvites\(collectionId\)/)
    expect(panel).not.toMatch(/'\/api\/collections/)

    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    expect(paths.routes.apiCollectionMembers(id)).toBe(`/api/collections/${id}/members`)
    expect(paths.routes.apiCollectionMember(id, 'u 2')).toBe(
      `/api/collections/${id}/members/u%202`,
    )
    expect(paths.routes.apiCollectionInvites(id)).toBe(`/api/collections/${id}/invites`)
  })

  it('ships DE and EN copy for every team key', () => {
    const keys = [
      'title',
      'empty',
      'needsCollection',
      'add',
      'addPlaceholder',
      'added',
      'addError',
      'userMissing',
      'remove',
      'removeError',
      'inviteLink',
      'inviteCopied',
      'inviteError',
      'loadError',
    ]
    for (const locale of paths.localeChoices) {
      const t = createTranslator(locale)
      for (const key of keys) {
        const full = `collections.team.${key}`
        expect(t(full), `${locale}:${full}`).not.toBe(full)
      }
    }
  })
})

describe('local member projection stays read-only', () => {
  it('keeps the PLEXON provisioning replay in db/workspaces.ts untouched', () => {
    const workspaces = read('lib/db/workspaces.ts')
    expect(workspaces).toMatch(
      /delete from videon_workspace_members where workspace_id = \$1/,
    )
    expect(workspaces).toMatch(
      /insert into videon_workspace_members \(workspace_id, plexon_user_id, role\)/,
    )
    expect(workspaces).toMatch(/The provisioning body is authoritative/)
  })

  it('never writes videon_workspace_members from the team surface', () => {
    const teamSources = [
      'lib/collection-members-plexon.ts',
      'lib/collection-team-access.ts',
      'components/collection-team-panel.tsx',
      'app/api/collections/[platformProjectId]/members/route.ts',
      'app/api/collections/[platformProjectId]/members/[userId]/route.ts',
      'app/api/collections/[platformProjectId]/invites/route.ts',
    ]
    for (const relativePath of teamSources) {
      const source = read(relativePath)
      expect(source, relativePath).not.toMatch(
        /(insert\s+into|update|delete\s+from)\s+videon_workspace/i,
      )
      expect(source, relativePath).not.toMatch(/from\s+'[^']*db\/workspaces'/)
      expect(source, relativePath).not.toMatch(/upsertWorkspace|databasePool/)
    }
  })
})
