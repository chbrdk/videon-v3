/**
 * Multi-signal Cut scene ↔ Premiere track-item matching (Wave P4.2).
 * Pure — no Premiere host deps. Used by premiere-patch-cut.js.
 *
 * Signals (strong → weak): scene id mark → mediaAssetId → filename → timeline/in → order.
 * Unique assignment only; ambiguous ties fail closed.
 */

import {
  sceneIdFromAnyText,
  stripSceneIdMark,
} from './clip-identity.js'

const UUID_BODY =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UUID_RE = new RegExp(`^${UUID_BODY}$`, 'i')
const MEDIA_IN_PATH_RE = new RegExp(`(?:^|[/\\\\])media[/\\\\](${UUID_BODY})(?:[/\\\\]|$)`, 'i')
const FILE_PREFIX_RE = new RegExp(`(?:^|[^a-z0-9])file-(${UUID_BODY})(?:[^a-z0-9]|$)`, 'i')

/** Minimum score to accept a non-forced pairing. */
export const MATCH_MIN_SCORE = 55
/** Timeline / in-point windows (ms). */
export const MATCH_TIMELINE_TIGHT_MS = 120
export const MATCH_TIMELINE_NEAR_MS = 600
export const MATCH_TIMELINE_LOOSE_MS = 2500
export const MATCH_IN_TIGHT_MS = 120
export const MATCH_IN_NEAR_MS = 600

export function isUuid(value) {
  return UUID_RE.test(String(value || '').trim())
}

export function normalizeFilenameKey(name) {
  const stripped = stripSceneIdMark(String(name || ''))
  const base = stripped.split(/[/\\]/).pop()?.trim() || ''
  if (!base) return ''
  try {
    return decodeURIComponent(base).toLowerCase()
  } catch {
    return base.toLowerCase()
  }
}

export { sceneIdFromAnyText } from './clip-identity.js'

/** Extract mediaAssetId from path / file-id / open-cut cache paths. */
export function mediaAssetIdFromAnyText(text) {
  const raw = String(text || '')
  if (!raw) return null
  const fromMedia = raw.match(MEDIA_IN_PATH_RE)
  if (fromMedia?.[1]) return fromMedia[1]
  const fromFile = raw.match(FILE_PREFIX_RE)
  if (fromFile?.[1]) return fromFile[1]
  // …/media/{uuid}/source or …/{uuid}.mp4 when uuid is the whole stem
  const stem = normalizeFilenameKey(raw).replace(/\.[a-z0-9]+$/i, '')
  if (isUuid(stem)) return stem
  return null
}

function sceneFilenameKeys(scene) {
  const keys = []
  for (const n of [
    scene?.originalFilename,
    scene?.mediaFilename,
    scene?.filename,
    scene?.media?.originalFilename,
    scene?.media?.filename,
    scene?.name,
  ]) {
    const k = normalizeFilenameKey(n)
    if (k) keys.push(k)
  }
  return [...new Set(keys)]
}

function absDelta(a, b) {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.abs(Number(a) - Number(b))
}

function proximityScore(delta, tight, near, loose, ptsTight, ptsNear, ptsLoose) {
  if (delta == null) return { add: 0, reason: null }
  if (delta <= tight) return { add: ptsTight, reason: 'tight' }
  if (delta <= near) return { add: ptsNear, reason: 'near' }
  if (delta <= loose) return { add: ptsLoose, reason: 'loose' }
  return { add: 0, reason: null }
}

/**
 * Score one scene against one clip fingerprint.
 * @param {object} scene
 * @param {object} clip — { sceneId?, mediaAssetId?, filenameKey?, timelineStartMs?, inMs?, index? }
 */
export function scoreSceneAgainstClip(scene, clip, sceneIndex = 0) {
  let score = 0
  /** @type {string[]} */
  const reasons = []

  const clipSceneId = clip.sceneId || sceneIdFromAnyText(clip.name || '')
  if (clipSceneId && scene?.id && String(clipSceneId).toLowerCase() === String(scene.id).toLowerCase()) {
    score += 1000
    reasons.push('scene_id')
  }

  const clipMedia =
    clip.mediaAssetId ||
    mediaAssetIdFromAnyText(clip.mediaPath || '') ||
    mediaAssetIdFromAnyText(clip.name || '')
  if (
    clipMedia &&
    scene?.mediaAssetId &&
    String(clipMedia).toLowerCase() === String(scene.mediaAssetId).toLowerCase()
  ) {
    score += 400
    reasons.push('media_id')
  }

  const sceneKeys = sceneFilenameKeys(scene)
  const clipKey =
    clip.filenameKey ||
    normalizeFilenameKey(clip.filename) ||
    normalizeFilenameKey(stripSceneIdMark(clip.name || '')) ||
    normalizeFilenameKey(clip.mediaPath || '')
  if (clipKey && sceneKeys.includes(clipKey)) {
    score += 200
    reasons.push('filename')
  } else if (clipKey && sceneKeys.length) {
    // Stem match without extension (Premiere sometimes drops/changes ext)
    const clipStem = clipKey.replace(/\.[a-z0-9]+$/i, '')
    if (sceneKeys.some((k) => k.replace(/\.[a-z0-9]+$/i, '') === clipStem && clipStem.length >= 3)) {
      score += 120
      reasons.push('filename_stem')
    }
  }

  const sceneTl =
    typeof scene?.timelineStartMs === 'number' && Number.isFinite(scene.timelineStartMs)
      ? scene.timelineStartMs
      : null
  const tl = proximityScore(
    absDelta(clip.timelineStartMs, sceneTl),
    MATCH_TIMELINE_TIGHT_MS,
    MATCH_TIMELINE_NEAR_MS,
    MATCH_TIMELINE_LOOSE_MS,
    90,
    45,
    18,
  )
  if (tl.add) {
    score += tl.add
    reasons.push(`timeline_${tl.reason}`)
  }

  const sceneIn =
    typeof scene?.startMs === 'number' && Number.isFinite(scene.startMs) ? scene.startMs : null
  const inn = proximityScore(
    absDelta(clip.inMs, sceneIn),
    MATCH_IN_TIGHT_MS,
    MATCH_IN_NEAR_MS,
    MATCH_TIMELINE_LOOSE_MS,
    50,
    25,
    8,
  )
  if (inn.add) {
    score += inn.add
    reasons.push(`in_${inn.reason}`)
  }

  const clipDur =
    clip.timelineStartMs != null && clip.timelineEndMs != null
      ? Math.max(0, clip.timelineEndMs - clip.timelineStartMs)
      : clip.outMs != null && clip.inMs != null
        ? Math.max(0, clip.outMs - clip.inMs)
        : null
  const sceneDur =
    scene?.endMs != null && scene?.startMs != null
      ? Math.max(0, scene.endMs - scene.startMs)
      : null
  const durDelta = absDelta(clipDur, sceneDur)
  if (durDelta != null && durDelta <= MATCH_TIMELINE_TIGHT_MS) {
    score += 35
    reasons.push('duration_tight')
  } else if (durDelta != null && durDelta <= MATCH_TIMELINE_NEAR_MS) {
    score += 15
    reasons.push('duration_near')
  }

  if (typeof clip.index === 'number' && clip.index === sceneIndex) {
    score += 12
    reasons.push('same_index')
  }

  return { score, reasons, clipSceneId, clipMedia, clipKey }
}

/**
 * Greedy unique assignment by descending score; ties / ambiguity fail that edge.
 * @param {object[]} scenes
 * @param {object[]} clips — fingerprints with at least `index`
 */
export function matchScenesToClips(scenes, clips) {
  const sceneList = Array.isArray(scenes) ? scenes.filter(Boolean) : []
  const clipList = Array.isArray(clips) ? clips.filter(Boolean) : []

  if (!sceneList.length) {
    return { ok: false, mode: 'none', pairs: [], message: 'Keine Scenes zum Patch.' }
  }
  if (!clipList.length) {
    return { ok: false, mode: 'none', pairs: [], message: 'Keine Video-Clips auf V1' }
  }

  /** @type {Array<{ sceneIndex: number, clipIndex: number, score: number, reasons: string[] }>} */
  const edges = []
  for (let s = 0; s < sceneList.length; s += 1) {
    for (let c = 0; c < clipList.length; c += 1) {
      const clip = { ...clipList[c], index: clipList[c].index ?? c }
      const scored = scoreSceneAgainstClip(sceneList[s], clip, s)
      if (scored.score > 0) {
        edges.push({
          sceneIndex: s,
          clipIndex: c,
          score: scored.score,
          reasons: scored.reasons,
        })
      }
    }
  }

  edges.sort((a, b) => b.score - a.score || a.sceneIndex - b.sceneIndex || a.clipIndex - b.clipIndex)

  const sceneTaken = new Set()
  const clipTaken = new Set()
  /** @type {Array<{ scene: object, itemIndex: number, score: number, reasons: string[] }>} */
  const pairs = []
  /** @type {string[]} */
  const modes = []

  const tryAssign = (minScore, modeTag) => {
    for (const edge of edges) {
      if (edge.score < minScore) continue
      if (sceneTaken.has(edge.sceneIndex) || clipTaken.has(edge.clipIndex)) continue
      // Ambiguity: another unused edge with same score sharing scene or clip
      const rivals = edges.filter(
        (e) =>
          e !== edge &&
          e.score === edge.score &&
          !sceneTaken.has(e.sceneIndex) &&
          !clipTaken.has(e.clipIndex) &&
          (e.sceneIndex === edge.sceneIndex || e.clipIndex === edge.clipIndex),
      )
      if (rivals.length) continue

      sceneTaken.add(edge.sceneIndex)
      clipTaken.add(edge.clipIndex)
      const clip = clipList[edge.clipIndex]
      pairs.push({
        scene: sceneList[edge.sceneIndex],
        itemIndex: typeof clip.index === 'number' ? clip.index : edge.clipIndex,
        score: edge.score,
        reasons: edge.reasons,
      })
      modes.push(modeTag)
    }
  }

  // Pass 1: hard identity (scene id)
  tryAssign(1000, 'scene_id')
  // Pass 2: media id (alone or with other signals)
  tryAssign(400, 'media_id')
  // Pass 3: strong composite (filename + timing etc.)
  tryAssign(MATCH_MIN_SCORE, 'scored')

  // Pass 4: remaining equal-count → order fill only if every leftover scene has a
  // leftover clip at the same relative order OR best remaining score ≥ soft floor
  if (sceneTaken.size < sceneList.length) {
    const leftScenes = []
    for (let s = 0; s < sceneList.length; s += 1) {
      if (!sceneTaken.has(s)) leftScenes.push(s)
    }
    const leftClips = []
    for (let c = 0; c < clipList.length; c += 1) {
      if (!clipTaken.has(c)) leftClips.push(c)
    }

    if (leftScenes.length === leftClips.length && leftScenes.length > 0) {
      // Prefer best remaining edge per scene among left clips
      let orderOk = true
      const fill = []
      for (const s of leftScenes) {
        let best = null
        for (const c of leftClips) {
          if (fill.some((f) => f.clipIndex === c)) continue
          const clip = { ...clipList[c], index: clipList[c].index ?? c }
          const scored = scoreSceneAgainstClip(sceneList[s], clip, s)
          // Soft floor: allow pure order (same_index / low score) when counts match
          const soft = Math.max(scored.score, clip.index === s ? 12 : 1)
          if (!best || soft > best.score) {
            best = { sceneIndex: s, clipIndex: c, score: soft, reasons: scored.reasons.length ? scored.reasons : ['order_fill'] }
          }
        }
        if (!best) {
          orderOk = false
          break
        }
        // Ambiguous best among remaining
        const tied = leftClips.filter((c) => {
          if (fill.some((f) => f.clipIndex === c) || c === best.clipIndex) return false
          const clip = { ...clipList[c], index: clipList[c].index ?? c }
          const scored = scoreSceneAgainstClip(sceneList[s], clip, s)
          const soft = Math.max(scored.score, clip.index === s ? 12 : 1)
          return soft === best.score
        })
        if (tied.length) {
          // Deterministic: pick by clip index order when tied and counts match
          const orderedClip = leftClips.find((c) => !fill.some((f) => f.clipIndex === c))
          if (orderedClip == null) {
            orderOk = false
            break
          }
          fill.push({
            sceneIndex: s,
            clipIndex: orderedClip,
            score: 1,
            reasons: ['order_fill'],
          })
        } else {
          fill.push(best)
        }
      }

      if (orderOk && fill.length === leftScenes.length) {
        const used = new Set(fill.map((f) => f.clipIndex))
        if (used.size === fill.length) {
          for (const edge of fill) {
            sceneTaken.add(edge.sceneIndex)
            clipTaken.add(edge.clipIndex)
            const clip = clipList[edge.clipIndex]
            pairs.push({
              scene: sceneList[edge.sceneIndex],
              itemIndex: typeof clip.index === 'number' ? clip.index : edge.clipIndex,
              score: edge.score,
              reasons: edge.reasons,
            })
            modes.push('order_fill')
          }
        }
      }
    }
  }

  if (pairs.length !== sceneList.length) {
    const missing = sceneList
      .filter((_, i) => !sceneTaken.has(i))
      .map((s) => s.id || '?')
    return {
      ok: false,
      mode: 'none',
      pairs: [],
      message: `${missing.length} Scene(s) nicht eindeutig zuordenbar (Premiere ${clipList.length} Clip(s), Cut ${sceneList.length}).`,
      missingSceneIds: missing,
      diagnostics: { edgeCount: edges.length, assigned: pairs.length },
    }
  }

  // Conflict: two pairs same itemIndex
  const usedItems = new Set(pairs.map((p) => p.itemIndex))
  if (usedItems.size !== pairs.length) {
    return {
      ok: false,
      mode: 'none',
      pairs: [],
      message: 'Match-Konflikt: mehrere Scenes auf denselben Clip.',
    }
  }

  const primary =
    modes.every((m) => m === 'scene_id')
      ? 'by_scene_id'
      : modes.includes('scene_id') || modes.includes('media_id') || modes.includes('scored')
        ? modes.includes('order_fill')
          ? 'hybrid'
          : 'by_signals'
        : 'by_order'

  return {
    ok: true,
    mode: primary,
    pairs,
    message: null,
    extraClips: Math.max(0, clipList.length - sceneList.length),
  }
}

/**
 * Find linked audio clips for a video scene (stereo = often 2 items on A1/A2).
 * Match BEFORE moving video when possible (uses videoClip.timelineStartMs as AV link hint).
 * Returns audio clip indices (into audioClips array), not track-local indexes.
 *
 * @param {object} scene
 * @param {object|null} videoClip — fingerprint of matched video item (pre-patch)
 * @param {object[]} audioClips
 * @param {Set<number>} usedIndices
 * @param {{ maxPerScene?: number }} [opts]
 */
export function selectLinkedAudioClips(scene, videoClip, audioClips, usedIndices = new Set(), opts = {}) {
  const maxPerScene = Math.max(1, Number(opts.maxPerScene) || 4)
  const list = Array.isArray(audioClips) ? audioClips : []
  /** @type {Array<{ index: number, score: number, reasons: string[] }>} */
  const candidates = []

  for (let i = 0; i < list.length; i += 1) {
    if (usedIndices.has(i)) continue
    const clip = { ...list[i], index: list[i].index ?? i }
    const scored = scoreSceneAgainstClip(scene, clip, 0)
    let score = scored.score
    const reasons = [...scored.reasons]

    const tlVsVideo = absDelta(clip.timelineStartMs, videoClip?.timelineStartMs)
    if (tlVsVideo != null && tlVsVideo <= MATCH_TIMELINE_NEAR_MS) {
      score += 80
      reasons.push('av_timeline_link')
    } else if (tlVsVideo != null && tlVsVideo <= MATCH_TIMELINE_LOOSE_MS) {
      score += 25
      reasons.push('av_timeline_near')
    }

    const strong =
      reasons.includes('scene_id') ||
      reasons.includes('media_id') ||
      reasons.includes('filename') ||
      reasons.includes('filename_stem')
    if (!strong && score < MATCH_MIN_SCORE + 80) continue
    if (score < 40) continue

    candidates.push({ index: i, score, reasons })
  }

  candidates.sort((a, b) => b.score - a.score || a.index - b.index)
  if (!candidates.length) return []

  // Prefer the top media/scene cluster so both stereo channels come along.
  const top = candidates[0]
  const cluster = candidates.filter((c) => {
    if (c.score < top.score - 120) return false
    const clip = list[c.index]
    const topClip = list[top.index]
    if (top.reasons.includes('scene_id') && c.reasons.includes('scene_id')) return true
    if (
      topClip?.mediaAssetId &&
      clip?.mediaAssetId &&
      String(topClip.mediaAssetId).toLowerCase() === String(clip.mediaAssetId).toLowerCase()
    ) {
      return true
    }
    const topKey = topClip?.filenameKey || normalizeFilenameKey(topClip?.filename || topClip?.name)
    const clipKey = clip?.filenameKey || normalizeFilenameKey(clip?.filename || clip?.name)
    if (topKey && clipKey && topKey === clipKey) return true
    // Same AV timeline cluster as video
    const d = absDelta(clip?.timelineStartMs, videoClip?.timelineStartMs)
    return d != null && d <= MATCH_TIMELINE_NEAR_MS && c.score >= MATCH_MIN_SCORE
  })

  return cluster.slice(0, maxPerScene).map((c) => c.index)
}

/**
 * Back-compat helper: names-only pairing via matchScenesToClips.
 * @deprecated Prefer matchScenesToClips with full fingerprints.
 */
export function pairScenesToTrackItemNames(scenes, itemNames) {
  const clips = (itemNames || []).map((name, index) => ({
    index,
    name: String(name || ''),
    sceneId: sceneIdFromAnyText(name),
    filenameKey: normalizeFilenameKey(stripSceneIdMark(name)),
  }))
  const result = matchScenesToClips(scenes, clips)
  if (!result.ok) {
    return {
      mode: 'none',
      pairs: [],
      message: result.message,
      missingSceneIds: result.missingSceneIds,
    }
  }
  return {
    mode: result.mode,
    pairs: result.pairs.map(({ scene, itemIndex, score, reasons }) => ({
      scene,
      itemIndex,
      score,
      reasons,
    })),
    message: null,
    extraClips: result.extraClips,
  }
}
