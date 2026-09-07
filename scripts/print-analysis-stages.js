#!/usr/bin/env node
/**
 * Staging helper: print analysis_stage_runs for a media's latest analysis.
 * Usage: MEDIA_ID=… [ANALYSIS_ID=…] node scripts/print-analysis-stages.js
 */
const { Client } = require('pg')

const MEDIA = process.env.MEDIA_ID || '1f454cd2-ba8b-48f5-b861-2ec5ce33c3ec'
const ANALYSIS = process.env.ANALYSIS_ID || ''

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL missing')
  const client = new Client({ connectionString: url })
  await client.connect()

  let analysisId = ANALYSIS
  if (!analysisId) {
    const latest = await client.query(
      `select id from analysis_runs where media_asset_id = $1 order by created_at desc limit 1`,
      [MEDIA],
    )
    analysisId = latest.rows[0]?.id
  }
  if (!analysisId) throw new Error('no analysis run')

  const run = await client.query(
    `select id, status, updated_at, finished_at, requested_capabilities
       from analysis_runs where id = $1`,
    [analysisId],
  )
  const stages = await client.query(
    `select stage_key, status, attempt, error_message, started_at, finished_at, updated_at
       from analysis_stage_runs
      where analysis_run_id = $1
      order by started_at nulls last, updated_at`,
    [analysisId],
  )
  const stems = await client.query(
    `select stem_kind, method, bytes, updated_at
       from media_audio_stems where analysis_run_id = $1`,
    [analysisId],
  )
  console.log(JSON.stringify({ run: run.rows[0], stages: stages.rows, stems: stems.rows }, null, 2))
  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
