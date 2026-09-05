import { describe, expect, it } from 'vitest'
import { workspaceHref } from '@/lib/collection-context'
import { paths } from '@/lib/paths'

describe('workspaceHref', () => {
  it('appends platformProjectId to collection-scoped routes', () => {
    expect(workspaceHref(paths.routes.library, 'proj-1')).toBe('/library?platformProjectId=proj-1')
    expect(workspaceHref(paths.routes.analyses, 'proj-1')).toBe('/analyses?platformProjectId=proj-1')
    expect(workspaceHref(paths.routes.upload, 'proj-1')).toBe('/upload?platformProjectId=proj-1')
    expect(workspaceHref(paths.routes.cuts, 'proj-1')).toBe('/cuts?platformProjectId=proj-1')
  })

  it('leaves routes unchanged without collection context', () => {
    expect(workspaceHref(paths.routes.library, null)).toBe('/library')
    expect(workspaceHref(paths.routes.home, 'proj-1')).toBe('/')
  })
})
