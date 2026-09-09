#!/usr/bin/env node
/**
 * One-shot staging helper: enqueue Demucs analysis for a media asset.
 * Usage: MEDIA_ID=… PLATFORM_PROJECT_ID=… node scripts/trigger-demucs-once.js
 */
const { randomUUID } = require('crypto')
const fs = require('fs')
const { Client } = require('pg')
const { PgBoss } = require('pg-boss')

const MEDIA = process.env.MEDIA_ID || '1f454cd2-ba8b-48f5-b861-2ec5ce33c3ec'
const PROJECT = process.env.PLATFORM_PROJECT_ID || '32498667-471e-4b21-b920-5eff5c338300'
const FLAG = `/tmp/videon-demucs-trigger-${MEDIA}.done`
const JOB = 'videon.media.analysis'

async function main() {
  if (fs.existsSync(FLAG) && process.env.FORCE !== '1') {
    console.log('SKIP already triggered', FLAG)
    return
  }
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL missing')

  const client = new Client({ connectionString: url })
  await client.connect()
  const mediaRes = await client.query(
    `select m.id, m.workspace_id, m.checksum_sha256, w.platform_project_id, w.owner_plexon_user_id
       from media_assets m
       join videon_workspaces w on w.id = m.workspace_id
      where m.id = $1`,
    [MEDIA],
  )
  if (!mediaRes.rows.length) throw new Error('media not found')
  const row = mediaRes.rows[0]
  if (row.platform_project_id !== PROJECT) {
    throw new Error(`project mismatch: ${row.platform_project_id}`)
  }

  await client.query(
    `update analysis_runs
        set status = 'cancelled',
            finished_at = coalesce(finished_at, now()),
            updated_at = now()
      where media_asset_id = $1
        and status in ('queued', 'running')`,
    [MEDIA],
  )

  const analysisId = randomUUID()
  const caps = JSON.stringify(['probe', 'scene_detect', 'vision', 'aggregate', 'stems.demucs'])
  const fingerprint = `videon.pipeline.v2:videon.scene-insight.v2:${row.checksum_sha256}`
  await client.query(
    `insert into analysis_runs (
       id, media_asset_id, requested_by_plexon_user_id, pipeline_version, scene_schema_version,
       requested_capabilities, input_fingerprint, idempotency_key, status
     ) values ($1,$2,$3,'videon.pipeline.v2','videon.scene-insight.v2',$4::jsonb,$5,$6,'queued')`,
    [
      analysisId,
      MEDIA,
      row.owner_plexon_user_id,
      caps,
      fingerprint,
      `rerun:${MEDIA}:${randomUUID()}`,
    ],
  )
  await client.query(
    `update media_assets
        set lifecycle_state = 'processing', updated_at = now()
      where id = $1 and workspace_id = $2`,
    [MEDIA, row.workspace_id],
  )
  await client.end()

  const boss = new PgBoss({ connectionString: url })
  await boss.start()
  try {
    await boss.createQueue(JOB)
  } catch {
    /* queue may already exist */
  }
  const jobId = await boss.send(
    JOB,
    { analysisRunId: analysisId, mediaAssetId: MEDIA },
    {
      singletonKey: analysisId,
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 7200,
    },
  )
  await boss.stop({ graceful: false, timeout: 5 })
  fs.writeFileSync(FLAG, JSON.stringify({ analysisId, jobId, at: new Date().toISOString() }))
  console.log(JSON.stringify({ ok: true, analysisId, jobId }))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
