#!/usr/bin/env node
/**
 * Staging helper: print latest analysis + stem method for a media asset.
 * Usage: MEDIA_ID=… node scripts/print-stem-status.js
 */
const { Client } = require('pg')

const MEDIA = process.env.MEDIA_ID || '1f454cd2-ba8b-48f5-b861-2ec5ce33c3ec'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL missing')
  const client = new Client({ connectionString: url })
  await client.connect()
  const runs = await client.query(
    `select id, status, updated_at, finished_at
       from analysis_runs
      where media_asset_id = $1
      order by created_at desc
      limit 5`,
    [MEDIA],
  )
  const stems = await client.query(
    `select stem_kind, method, bytes, updated_at, analysis_run_id
       from media_audio_stems
      where media_asset_id = $1
      order by updated_at desc`,
    [MEDIA],
  )
  console.log(JSON.stringify({ media: MEDIA, runs: runs.rows, stems: stems.rows }, null, 2))
  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
