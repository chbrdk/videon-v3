/**
 * VIDEON v3 MCP tools — Phase 1 read. Spec: specs/domain/mcp-server.md
 */
import { z } from 'zod'
import { isVideonError, videonFetch } from './videon-client.js'

const actorUserId = z
  .string()
  .describe('Plexon user id (injected by Plexon assistant; Access Model B actor)')

function toTextContent(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

type ToolServer = {
  registerTool: (
    name: string,
    config: { title?: string; description?: string; inputSchema?: z.ZodTypeAny },
    cb: (args: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>,
  ) => void
}

async function textResult(path: string, options?: Parameters<typeof videonFetch>[1]) {
  const res = await videonFetch(path, options)
  return { content: [{ type: 'text' as const, text: toTextContent(res) }] }
}

function actorOf(args: { actorUserId?: string }): string {
  return (args.actorUserId || '').trim()
}

function mediaDeepLink(input: {
  mediaAssetId: string
  platformProjectId: string
  startMs?: number | null
  sceneKey?: string | null
}): string {
  const params = new URLSearchParams({ platformProjectId: input.platformProjectId })
  if (input.startMs != null && Number.isFinite(input.startMs) && input.startMs >= 0) {
    params.set('t', String(Math.floor(input.startMs)))
  }
  if (input.sceneKey?.trim()) params.set('scene', input.sceneKey.trim())
  return `/media/${encodeURIComponent(input.mediaAssetId)}?${params.toString()}`
}

export const VIDEON_TOOL_NAMES = [
  'videon.health',
  'videon.projects_list',
  'videon.media_search',
  'videon.media_list',
  'videon.media_get',
  'videon.analysis_get',
  'videon.cuts_list',
  'videon.cut_get',
  'videon.analysis_run',
  'videon.brand_check_run',
  'videon.cut_create',
  'videon.export_run',
] as const

export function registerVideonTools(server: ToolServer) {
  server.registerTool(
    'videon.health',
    {
      title: 'Health',
      description: 'GET /api/health — videon-v3 liveness.',
      inputSchema: z.object({}),
    },
    async () => textResult('/api/health'),
  )

  server.registerTool(
    'videon.projects_list',
    {
      title: 'List accessible projects',
      description:
        'GET /api/collections — Access Model B projects for the actor (actorUserId + service auth).',
      inputSchema: z.object({
        actorUserId,
      }),
    },
    async (args) => {
      const a = args as { actorUserId?: string }
      return textResult('/api/collections', { videon: { actorUserId: actorOf(a) } })
    },
  )

  server.registerTool(
    'videon.media_search',
    {
      title: 'Search scenes',
      description:
        'GET /api/media/search — NL scene search across accessible projects (or one platformProjectId). Returns bounded hits with editor deep links (t/scene). Access Model B via actorUserId + service auth.',
      inputSchema: z.object({
        actorUserId,
        q: z.string().describe('Natural-language or keyword query'),
        platformProjectId: z.string().optional().describe('Optional Collection scope'),
        limit: z.number().int().positive().max(20).optional(),
      }),
    },
    async (args) => {
      const { q, platformProjectId, limit } = args as {
        actorUserId?: string
        q: string
        platformProjectId?: string
        limit?: number
      }
      const params = new URLSearchParams({ q: q.trim() })
      if (platformProjectId?.trim()) params.set('platformProjectId', platformProjectId.trim())
      const res = await videonFetch<{
        items?: Array<{
          id: string
          mediaAssetId: string
          sceneKey: string | null
          searchText: string
          mediaFilename: string
          startMs: number | null
          endMs: number | null
          platformProjectId?: string
          projectName?: string | null
        }>
        query?: string
        terms?: string[]
        scope?: string
      }>(`/api/media/search?${params}`, { videon: { actorUserId: actorOf(args as { actorUserId?: string }) } })
      if (isVideonError(res)) {
        return { content: [{ type: 'text' as const, text: toTextContent(res) }] }
      }
      const max = limit && limit > 0 ? Math.min(limit, 20) : 20
      const items = (res.items ?? []).slice(0, max).map((hit) => {
        const projectId = hit.platformProjectId
        return {
          id: hit.id,
          mediaAssetId: hit.mediaAssetId,
          sceneKey: hit.sceneKey,
          mediaFilename: hit.mediaFilename,
          startMs: hit.startMs,
          endMs: hit.endMs,
          platformProjectId: projectId ?? null,
          projectName: hit.projectName ?? null,
          searchText: (hit.searchText || '').slice(0, 200),
          href:
            projectId != null
              ? mediaDeepLink({
                  mediaAssetId: hit.mediaAssetId,
                  platformProjectId: projectId,
                  startMs: hit.startMs,
                  sceneKey: hit.sceneKey,
                })
              : null,
        }
      })
      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent({
              scope: res.scope,
              query: res.query,
              terms: res.terms,
              count: items.length,
              items,
            }),
          },
        ],
      }
    },
  )

  server.registerTool(
    'videon.media_list',
    {
      title: 'List media',
      description:
        'GET /api/media — library list (optional platformProjectId; else accessible). Access Model B via actorUserId + service auth.',
      inputSchema: z.object({
        actorUserId,
        platformProjectId: z.string().optional(),
      }),
    },
    async (args) => {
      const { platformProjectId } = args as { actorUserId?: string; platformProjectId?: string }
      const params = new URLSearchParams()
      if (platformProjectId?.trim()) params.set('platformProjectId', platformProjectId.trim())
      const qs = params.toString()
      return textResult(`/api/media${qs ? `?${qs}` : ''}`, {
        videon: { actorUserId: actorOf(args as { actorUserId?: string }) },
      })
    },
  )

  server.registerTool(
    'videon.media_get',
    {
      title: 'Media detail (bounded)',
      description:
        'GET /api/media/:id — lifecycle, analysis status, scene index (≤40), deep links. No full transcript/stems/binaries. Access Model B via actorUserId + service auth.',
      inputSchema: z.object({
        actorUserId,
        mediaAssetId: z.string(),
        platformProjectId: z.string(),
      }),
    },
    async (args) => {
      const { mediaAssetId, platformProjectId } = args as {
        actorUserId?: string
        mediaAssetId: string
        platformProjectId: string
      }
      const res = await videonFetch<{
        media?: Record<string, unknown>
        analysis?: Record<string, unknown> | null
        scenes?: Array<{
          sceneKey: string
          startMs: number
          endMs: number
          searchText?: string
        }>
        stages?: unknown[]
      }>(
        `/api/media/${encodeURIComponent(mediaAssetId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
        { videon: { actorUserId: actorOf(args as { actorUserId?: string }) } },
      )
      if (isVideonError(res)) {
        return { content: [{ type: 'text' as const, text: toTextContent(res) }] }
      }
      const scenes = (res.scenes ?? []).slice(0, 40).map((s) => ({
        sceneKey: s.sceneKey,
        startMs: s.startMs,
        endMs: s.endMs,
        searchText: (s.searchText || '').slice(0, 200),
        href: mediaDeepLink({
          mediaAssetId,
          platformProjectId,
          startMs: s.startMs,
          sceneKey: s.sceneKey,
        }),
      }))
      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent({
              media: res.media
                ? {
                    id: res.media.id,
                    originalFilename: res.media.originalFilename,
                    lifecycleState: res.media.lifecycleState,
                    durationMs: res.media.durationMs,
                  }
                : null,
              analysis: res.analysis
                ? {
                    status: (res.analysis as { status?: string }).status,
                    id: (res.analysis as { id?: string }).id,
                  }
                : null,
              sceneCount: scenes.length,
              scenes,
              href: mediaDeepLink({ mediaAssetId, platformProjectId }),
            }),
          },
        ],
      }
    },
  )

  server.registerTool(
    'videon.analysis_get',
    {
      title: 'Analysis runs',
      description:
        'GET /api/analyses — run/stage status for a project (requires platformProjectId). Access Model B via actorUserId + service auth.',
      inputSchema: z.object({
        actorUserId,
        platformProjectId: z.string(),
      }),
    },
    async (args) => {
      const { platformProjectId } = args as { actorUserId?: string; platformProjectId: string }
      return textResult(
        `/api/analyses?platformProjectId=${encodeURIComponent(platformProjectId)}`,
        { videon: { actorUserId: actorOf(args as { actorUserId?: string }) } },
      )
    },
  )

  server.registerTool(
    'videon.cuts_list',
    {
      title: 'List cuts',
      description:
        'GET /api/cuts — cuts for a project. Access Model B via actorUserId + service auth.',
      inputSchema: z.object({
        actorUserId,
        platformProjectId: z.string(),
      }),
    },
    async (args) => {
      const { platformProjectId } = args as { actorUserId?: string; platformProjectId: string }
      return textResult(`/api/cuts?platformProjectId=${encodeURIComponent(platformProjectId)}`, {
        videon: { actorUserId: actorOf(args as { actorUserId?: string }) },
      })
    },
  )

  server.registerTool(
    'videon.cut_get',
    {
      title: 'Cut detail (bounded)',
      description:
        'GET /api/cuts/:id — cut meta; omit heavy timeline payload when possible. Access Model B via actorUserId + service auth.',
      inputSchema: z.object({
        actorUserId,
        cutId: z.string(),
        platformProjectId: z.string(),
      }),
    },
    async (args) => {
      const { cutId, platformProjectId } = args as {
        actorUserId?: string
        cutId: string
        platformProjectId: string
      }
      const res = await videonFetch<Record<string, unknown>>(
        `/api/cuts/${encodeURIComponent(cutId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
        { videon: { actorUserId: actorOf(args as { actorUserId?: string }) } },
      )
      if (isVideonError(res)) {
        return { content: [{ type: 'text' as const, text: toTextContent(res) }] }
      }
      const cut = (res.cut ?? res) as Record<string, unknown>
      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent({
              id: cut.id ?? cutId,
              title: cut.title ?? cut.name,
              status: cut.status,
              clipCount: Array.isArray(res.clips) ? res.clips.length : undefined,
              href: `/cuts/${encodeURIComponent(cutId)}?platformProjectId=${encodeURIComponent(platformProjectId)}`,
            }),
          },
        ],
      }
    },
  )

  server.registerTool(
    'videon.analysis_run',
    {
      title: 'Start media analysis',
      description:
        'POST /api/media/:id/analysis — enqueue analysis job; poll with videon.analysis_get / media_get. Write tool — confirm with user. Access Model B via actorUserId + service auth.',
      inputSchema: z.object({
        actorUserId,
        mediaAssetId: z.string(),
        platformProjectId: z.string(),
        capabilities: z.array(z.string()).optional(),
        stemMethod: z.string().optional(),
      }),
    },
    async (args) => {
      const { mediaAssetId, platformProjectId, capabilities, stemMethod } = args as {
        actorUserId?: string
        mediaAssetId: string
        platformProjectId: string
        capabilities?: string[]
        stemMethod?: string
      }
      const body: Record<string, unknown> = {}
      if (capabilities?.length) body.capabilities = capabilities
      if (stemMethod?.trim()) body.stemMethod = stemMethod.trim()
      return textResult(
        `/api/media/${encodeURIComponent(mediaAssetId)}/analysis?platformProjectId=${encodeURIComponent(platformProjectId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          videon: { actorUserId: actorOf(args as { actorUserId?: string }) },
        },
      )
    },
  )

  server.registerTool(
    'videon.brand_check_run',
    {
      title: 'Start brand compliance check',
      description:
        'POST /api/media/:id/brand-check — requires prior succeeded analysis. Write tool — confirm with user. Access Model B via actorUserId + service auth.',
      inputSchema: z.object({
        actorUserId,
        mediaAssetId: z.string(),
        platformProjectId: z.string(),
      }),
    },
    async (args) => {
      const { mediaAssetId, platformProjectId } = args as {
        actorUserId?: string
        mediaAssetId: string
        platformProjectId: string
      }
      return textResult(
        `/api/media/${encodeURIComponent(mediaAssetId)}/brand-check?platformProjectId=${encodeURIComponent(platformProjectId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          videon: { actorUserId: actorOf(args as { actorUserId?: string }) },
        },
      )
    },
  )

  server.registerTool(
    'videon.cut_create',
    {
      title: 'Create cut',
      description:
        'POST /api/cuts — create a Cut from media/scenes. Write tool — confirm with user. Prefer Collection Flow for complex exports. Access Model B via actorUserId + service auth.',
      inputSchema: z.object({
        actorUserId,
        platformProjectId: z.string(),
        name: z.string(),
        mediaAssetId: z.string().optional(),
        startMs: z.number().optional(),
        endMs: z.number().optional(),
        scenes: z
          .array(
            z.object({
              sceneKey: z.string().optional(),
              startMs: z.number().optional(),
              endMs: z.number().optional(),
            }),
          )
          .optional(),
      }),
    },
    async (args) => {
      const {
        platformProjectId,
        name,
        mediaAssetId,
        startMs,
        endMs,
        scenes,
      } = args as {
        actorUserId?: string
        platformProjectId: string
        name: string
        mediaAssetId?: string
        startMs?: number
        endMs?: number
        scenes?: Array<{ sceneKey?: string; startMs?: number; endMs?: number }>
      }
      const body: Record<string, unknown> = { platformProjectId, name }
      if (mediaAssetId != null) body.mediaAssetId = mediaAssetId
      if (startMs != null) body.startMs = startMs
      if (endMs != null) body.endMs = endMs
      if (scenes != null) body.scenes = scenes
      return textResult('/api/cuts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        videon: { actorUserId: actorOf(args as { actorUserId?: string }) },
      })
    },
  )

  server.registerTool(
    'videon.export_run',
    {
      title: 'Start cut export',
      description:
        'POST /api/cuts/:id/exports — enqueue export job. Prefer Collection Flow when available. Write tool — confirm. Access Model B via actorUserId + service auth.',
      inputSchema: z.object({
        actorUserId,
        cutId: z.string(),
        platformProjectId: z.string(),
      }),
    },
    async (args) => {
      const { cutId, platformProjectId } = args as {
        actorUserId?: string
        cutId: string
        platformProjectId: string
      }
      return textResult(
        `/api/cuts/${encodeURIComponent(cutId)}/exports?platformProjectId=${encodeURIComponent(platformProjectId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          videon: { actorUserId: actorOf(args as { actorUserId?: string }) },
        },
      )
    },
  )
}
