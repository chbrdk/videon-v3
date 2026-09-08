import { randomUUID } from 'node:crypto'
import { databasePool } from './client'
import { buildSceneSearchPlan } from '@/lib/scene-search-query'

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

type SearchRow = {
  id: string
  media_asset_id: string
  analysis_run_id: string
  scene_key: string | null
  search_text: string
  original_filename: string
  rank: number
  start_ms: number | null
  end_ms: number | null
  platform_project_id?: string
}

function mapHit(row: SearchRow): SearchHit {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    analysisRunId: row.analysis_run_id,
    sceneKey: row.scene_key,
    searchText: row.search_text,
    mediaFilename: row.original_filename,
    rank: Number(row.rank) || 0,
    startMs: row.start_ms,
    endMs: row.end_ms,
    platformProjectId: row.platform_project_id,
  }
}

/**
 * Match via OR-prefix tsquery and/or ILIKE patterns (NL chat + typos).
 */
const MATCH_SQL = `
  (
    ($ts::text is not null and to_tsvector('simple', mse.search_text) @@ to_tsquery('simple', $ts))
    or ($likes::text[] is not null and cardinality($likes::text[]) > 0 and mse.search_text ilike any ($likes))
  )
`

const RANK_SQL = `
  (
    case
      when $ts::text is not null and to_tsvector('simple', mse.search_text) @@ to_tsquery('simple', $ts)
        then ts_rank(to_tsvector('simple', mse.search_text), to_tsquery('simple', $ts))
      else 0
    end
    + case
        when $likes::text[] is not null and mse.search_text ilike any ($likes) then 0.15
        else 0
      end
  )
`

export async function searchMediaInWorkspace(input: {
  workspaceId: string
  query: string
  limit?: number
}): Promise<SearchHit[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const plan = buildSceneSearchPlan(input.query)
  if (!plan.tsQuery && plan.likePatterns.length === 0) return []

  const result = await databasePool().query<SearchRow>(
    `select mse.id, mse.media_asset_id, mse.analysis_run_id, mse.scene_key, mse.search_text,
            ma.original_filename,
            si.start_ms, si.end_ms,
            ${RANK_SQL.replaceAll('$ts', '$2').replaceAll('$likes', '$3')} as rank
       from media_search_entries mse
       join media_assets ma on ma.id = mse.media_asset_id
       left join scene_insights si
         on si.analysis_run_id = mse.analysis_run_id
        and si.scene_key = mse.scene_key
      where mse.workspace_id = $1
        and ma.lifecycle_state <> 'archived'
        and ${MATCH_SQL.replaceAll('$ts', '$2').replaceAll('$likes', '$3')}
      order by rank desc, mse.created_at desc
      limit $4`,
    [input.workspaceId, plan.tsQuery, plan.likePatterns.length ? plan.likePatterns : null, limit],
  )

  return result.rows.map(mapHit)
}

const PLATFORM_PROJECT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Fail-closed scene search across Access Model B projects (uuid allowlist ∩ membership). */
export async function searchMediaForAccessibleProjects(input: {
  platformProjectIds: string[]
  plexonUserId: string
  query: string
  limit?: number
}): Promise<{ hits: SearchHit[]; planTerms: string[] }> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const plan = buildSceneSearchPlan(input.query)
  if (!plan.tsQuery && plan.likePatterns.length === 0) {
    return { hits: [], planTerms: [] }
  }
  const ids = [
    ...new Set(
      input.platformProjectIds
        .map((id) => id.trim())
        .filter((id) => PLATFORM_PROJECT_UUID_RE.test(id)),
    ),
  ]
  if (!ids.length) return { hits: [], planTerms: plan.terms }
  if (!PLATFORM_PROJECT_UUID_RE.test(input.plexonUserId.trim())) {
    return { hits: [], planTerms: plan.terms }
  }

  const result = await databasePool().query<SearchRow>(
    `select mse.id, mse.media_asset_id, mse.analysis_run_id, mse.scene_key, mse.search_text,
            ma.original_filename,
            si.start_ms, si.end_ms,
            w.platform_project_id::text as platform_project_id,
            ${RANK_SQL.replaceAll('$ts', '$2').replaceAll('$likes', '$3')} as rank
       from media_search_entries mse
       join media_assets ma on ma.id = mse.media_asset_id
       join videon_workspaces w on w.id = mse.workspace_id
       left join scene_insights si
         on si.analysis_run_id = mse.analysis_run_id
        and si.scene_key = mse.scene_key
      where w.platform_project_id = any($1::uuid[])
        and ma.lifecycle_state <> 'archived'
        and (
              w.owner_plexon_user_id = $4::uuid
           or exists (
                select 1 from videon_workspace_members mem
                 where mem.workspace_id = w.id and mem.plexon_user_id = $4::uuid
              )
            )
        and ${MATCH_SQL.replaceAll('$ts', '$2').replaceAll('$likes', '$3')}
      order by rank desc, mse.created_at desc
      limit $5`,
    [
      ids,
      plan.tsQuery,
      plan.likePatterns.length ? plan.likePatterns : null,
      input.plexonUserId,
      limit,
    ],
  )

  return { hits: result.rows.map(mapHit), planTerms: plan.terms }
}
