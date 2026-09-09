import { databasePool } from '@/lib/db/client'
import { listScenesForCut, type CutScene } from '@/lib/db/cuts'
import { listCutAudioClips, type CutAudioClip } from '@/lib/db/cut-audio'
import { listCutVideoClips, type CutVideoClip } from '@/lib/db/cut-video'

export type CutBatchMove = {
  lane: 'v1' | 'v2' | 'audio'
  id: string
  timelineStartMs: number
}

export async function moveCutClipsBatch(input: {
  cutId: string
  moves: CutBatchMove[]
}): Promise<{ scenes: CutScene[]; videoClips: CutVideoClip[]; audioClips: CutAudioClip[] } | null> {
  if (input.moves.length === 0) {
    return {
      scenes: await listScenesForCut(input.cutId),
      videoClips: await listCutVideoClips(input.cutId),
      audioClips: await listCutAudioClips(input.cutId),
    }
  }

  const client = await databasePool().connect()
  try {
    await client.query('begin')
    for (const move of input.moves) {
      const timelineStartMs = Math.max(0, Math.floor(move.timelineStartMs))
      if (move.lane === 'v1') {
        const result = await client.query(
          `update cut_scenes set timeline_start_ms = $3 where id = $1 and cut_id = $2`,
          [move.id, input.cutId, timelineStartMs],
        )
        if ((result.rowCount ?? 0) === 0) {
          await client.query('rollback')
          return null
        }
      } else if (move.lane === 'v2') {
        const result = await client.query(
          `update cut_video_clips set timeline_start_ms = $3 where id = $1 and cut_id = $2`,
          [move.id, input.cutId, timelineStartMs],
        )
        if ((result.rowCount ?? 0) === 0) {
          await client.query('rollback')
          return null
        }
      } else {
        const result = await client.query(
          `update cut_audio_clips set timeline_start_ms = $3 where id = $1 and cut_id = $2`,
          [move.id, input.cutId, timelineStartMs],
        )
        if ((result.rowCount ?? 0) === 0) {
          await client.query('rollback')
          return null
        }
      }
    }
    await client.query(`update cuts set updated_at = now() where id = $1`, [input.cutId])
    await client.query('commit')
    return {
      scenes: await listScenesForCut(input.cutId),
      videoClips: await listCutVideoClips(input.cutId),
      audioClips: await listCutAudioClips(input.cutId),
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
