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
}

export async function replaceSearchEntriesForAnalysis(input: {
  workspaceId: string
  mediaAssetId: string
  analysisRunId: string
  mediaFilename: string
  scenes: Array<{ sceneKey: string; summary: string; mood: string[]; location?: string }>
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
      searchText: [scene.summary, scene.location, ...scene.mood].filter(Boolean).join(' '),
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
    }
  >(
    `select mse.id, mse.media_asset_id, mse.analysis_run_id, mse.scene_key, mse.search_text,
            ma.original_filename,
            ts_rank(to_tsvector('simple', mse.search_text), plainto_tsquery('simple', $2)) as rank
       from media_search_entries mse
       join media_assets ma on ma.id = mse.media_asset_id
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
  }))
}
