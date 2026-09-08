import { randomUUID } from 'node:crypto'
import { databasePool } from './client'

export type SearchHit = {
  id: string
  mediaAssetId: string
  analysisRunId: string
  sceneKey: string | null
  searchText: string
  mediaFilename: string
  rank: number
  startMs: number | null
  endMs: number | null
  platformProjectId?: string
}

export async function replaceSearchEntriesForAnalysis(input: {
  workspaceId: string
  mediaAssetId: string
  analysisRunId: string
  mediaFilename: string
  scenes: Array<{
    sceneKey: string
    summary: string
    mood: string[]
    location?: string
    objectLabels?: string[]
    peopleRoles?: string[]
    brandHints?: string[]
  }>
}): Promise<void> {
  await databasePool().query(`delete from media_search_entries where analysis_run_id = $1`, [
    input.analysisRunId,
  ])

  const rows = [
    {
      sceneKey: null as string | null,
      searchText: input.mediaFilename,
    },
    ...input.scenes.map((scene) => ({
      sceneKey: scene.sceneKey,
      searchText: [
        scene.summary,
        scene.location,
        ...scene.mood,
        ...(scene.objectLabels ?? []),
        ...(scene.peopleRoles ?? []),
        ...(scene.brandHints ?? []),
      ]
        .filter(Boolean)
        .join(' '),
    })),
  ]

  for (const row of rows) {
    if (!row.searchText.trim()) continue
    await databasePool().query(
      `insert into media_search_entries (
         id, workspace_id, media_asset_id, analysis_run_id, scene_key, search_text
       ) values ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        input.workspaceId,
        input.mediaAssetId,
        input.analysisRunId,
        row.sceneKey,
        row.searchText.trim(),
      ],
    )
  }
}

export async function searchMediaInWorkspace(input: {
  workspaceId: string
  query: string
  limit?: number
}): Promise<SearchHit[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const query = input.query.trim()
  if (!query) return []

  const result = await databasePool().query<
    {
      id: string
      media_asset_id: string
      analysis_run_id: string
      scene_key: string | null
      search_text: string
      original_filename: string
      rank: number
      start_ms: number | null
      end_ms: number | null
    }
  >(
    `select mse.id, mse.media_asset_id, mse.analysis_run_id, mse.scene_key, mse.search_text,
            ma.original_filename,
            si.start_ms, si.end_ms,
            ts_rank(to_tsvector('simple', mse.search_text), plainto_tsquery('simple', $2)) as rank
       from media_search_entries mse
       join media_assets ma on ma.id = mse.media_asset_id
       left join scene_insights si
         on si.analysis_run_id = mse.analysis_run_id
        and si.scene_key = mse.scene_key
      where mse.workspace_id = $1
        and ma.lifecycle_state <> 'archived'
        and to_tsvector('simple', mse.search_text) @@ plainto_tsquery('simple', $2)
      order by rank desc, mse.created_at desc
      limit $3`,
    [input.workspaceId, query, limit],
  )

  return result.rows.map((row) => ({
    id: row.id,
    mediaAssetId: row.media_asset_id,
    analysisRunId: row.analysis_run_id,
    sceneKey: row.scene_key,
    searchText: row.search_text,
    mediaFilename: row.original_filename,
    rank: row.rank,
    startMs: row.start_ms,
    endMs: row.end_ms,
  }))
}

const PLATFORM_PROJECT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Fail-closed scene search across Access Model B projects (uuid allowlist ∩ membership). */
export async function searchMediaForAccessibleProjects(input: {
  platformProjectIds: string[]
  plexonUserId: string
  query: string
  limit?: number
}): Promise<SearchHit[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const query = input.query.trim()
  if (!query) return []
  const ids = [
    ...new Set(
      input.platformProjectIds
        .map((id) => id.trim())
        .filter((id) => PLATFORM_PROJECT_UUID_RE.test(id)),
    ),
  ]
  if (!ids.length) return []
  if (!PLATFORM_PROJECT_UUID_RE.test(input.plexonUserId.trim())) return []

  const result = await databasePool().query<{
    id: string
    media_asset_id: string
    analysis_run_id: string
    scene_key: string | null
    search_text: string
    original_filename: string
    rank: number
    start_ms: number | null
    end_ms: number | null
    platform_project_id: string
  }>(
    `select mse.id, mse.media_asset_id, mse.analysis_run_id, mse.scene_key, mse.search_text,
            ma.original_filename,
            si.start_ms, si.end_ms,
            w.platform_project_id::text as platform_project_id,
            ts_rank(to_tsvector('simple', mse.search_text), plainto_tsquery('simple', $2)) as rank
       from media_search_entries mse
       join media_assets ma on ma.id = mse.media_asset_id
       join videon_workspaces w on w.id = mse.workspace_id
       left join scene_insights si
         on si.analysis_run_id = mse.analysis_run_id
        and si.scene_key = mse.scene_key
      where w.platform_project_id = any($1::uuid[])
        and ma.lifecycle_state <> 'archived'
        and (
              w.owner_plexon_user_id = $3::uuid
           or exists (
                select 1 from videon_workspace_members mem
                 where mem.workspace_id = w.id and mem.plexon_user_id = $3::uuid
              )
            )
        and to_tsvector('simple', mse.search_text) @@ plainto_tsquery('simple', $2)
      order by rank desc, mse.created_at desc
      limit $4`,
    [ids, query, input.plexonUserId, limit],
  )

  return result.rows.map((row) => ({
    id: row.id,
    mediaAssetId: row.media_asset_id,
    analysisRunId: row.analysis_run_id,
    sceneKey: row.scene_key,
    searchText: row.search_text,
    mediaFilename: row.original_filename,
    rank: row.rank,
    startMs: row.start_ms,
    endMs: row.end_ms,
    platformProjectId: row.platform_project_id,
  }))
}
