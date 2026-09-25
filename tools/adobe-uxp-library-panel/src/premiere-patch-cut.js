/**
 * In-place Cut → Premiere patch: update existing track items by multi-signal match.
 * Spec Wave P4.2 — prefer over ZIP replace so Premiere-native effects stay on clips.
 *
 * Premiere aktualisieren MUST NOT silently ZIP — that destroys live FX.
 */

import { loadNativeModule } from './native.js'
import { encodeClipDisplayName, stripSceneIdMark } from './clip-identity.js'
import {
  matchScenesToClips,
  mediaAssetIdFromAnyText,
  normalizeFilenameKey,
  pairScenesToTrackItemNames,
  sceneIdFromAnyText,
  selectLinkedAudioClips,
} from './clip-match.js'
import { pathBasename } from './premiere-path.js'
import { sequenceMatchesLink } from './premiere-open-cut.js'

export { pairScenesToTrackItemNames, matchScenesToClips, selectLinkedAudioClips } from './clip-match.js'

async function getPremiereApi() {
  try {
    return await loadNativeModule('premierepro')
  } catch {
    return null
  }
}

function runLockedTransaction(project, name, build) {
  let ok = false
  let error = null
  try {
    project.lockedAccess(() => {
      ok = project.executeTransaction((compoundAction) => {
        build(compoundAction)
      }, name)
    })
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err))
    ok = false
  }
  return { ok, error }
}

function secondsFromMs(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n) / 1000
}

/** Normalize Cut scene timing for Premiere actions. */
export function sanitizeSceneTiming(scene) {
  const startMs = Math.max(0, Math.floor(Number(scene?.startMs) || 0))
  let endMs = Math.max(0, Math.floor(Number(scene?.endMs) || 0))
  if (endMs <= startMs) endMs = startMs + 500
  const timelineStartMs = Math.max(0, Math.floor(Number(scene?.timelineStartMs) || 0))
  const durationMs = endMs - startMs
  return {
    startMs,
    endMs,
    timelineStartMs,
    timelineEndMs: timelineStartMs + durationMs,
    durationMs,
  }
}

/**
 * Decide how to patch a track item without tripping Premiere "Invalid Parameter".
 * Prefer createMoveAction for pure slides (also keeps linked audio attached).
 */
export function planClipPatch(sceneTiming, videoFp, opts = {}) {
  const positionToleranceMs = opts.positionToleranceMs ?? 40
  const trimToleranceMs = opts.trimToleranceMs ?? 40
  const curStart = videoFp?.timelineStartMs
  const curEnd = videoFp?.timelineEndMs
  const curIn = videoFp?.inMs
  const curOut = videoFp?.outMs
  const curDur =
    curStart != null && curEnd != null && Number.isFinite(curStart) && Number.isFinite(curEnd)
      ? Math.max(0, curEnd - curStart)
      : null

  const near = (a, b) => a != null && b != null && Math.abs(a - b) <= trimToleranceMs
  const inSame = curIn == null || near(curIn, sceneTiming.startMs)
  const outSame = curOut == null || near(curOut, sceneTiming.endMs)
  const durSame = curDur == null || near(curDur, sceneTiming.durationMs)
  const posDelta =
    curStart != null && Number.isFinite(curStart) ? sceneTiming.timelineStartMs - curStart : null

  if (posDelta != null && Math.abs(posDelta) <= positionToleranceMs && inSame && outSame && durSame) {
    return { mode: 'noop' }
  }
  if (posDelta != null && Math.abs(posDelta) > positionToleranceMs && inSame && outSame && durSame) {
    return { mode: 'move', deltaMs: posDelta }
  }
  // No reliable current timeline → prefer move unavailable; set bounds without In/Out first.
  if (curStart == null) {
    return {
      mode: 'set_bounds',
      timelineStartMs: sceneTiming.timelineStartMs,
      timelineEndMs: sceneTiming.timelineEndMs,
      startMs: sceneTiming.startMs,
      endMs: sceneTiming.endMs,
      applyInOut: false,
    }
  }
  return {
    mode: 'set_bounds',
    timelineStartMs: sceneTiming.timelineStartMs,
    timelineEndMs: sceneTiming.timelineEndMs,
    startMs: sceneTiming.startMs,
    endMs: sceneTiming.endMs,
    // In/Out are fragile on video (Premiere bugs) — only when trim actually changed.
    applyInOut: !(inSame && outSame),
  }
}

function makeTickTime(TickTime, ms) {
  const seconds = secondsFromMs(ms)
  if (!Number.isFinite(seconds)) {
    throw new Error(`TickTime: ungültige ms (${ms})`)
  }
  try {
    const tick = TickTime.createWithSeconds(seconds)
    if (tick) return tick
  } catch {
    /* fall through */
  }
  if (typeof TickTime.createWithTicks === 'function') {
    const ticks = Math.round(seconds * 254_016_000_000)
    return TickTime.createWithTicks(String(Math.max(0, ticks)))
  }
  throw new Error('TickTime.createWithSeconds/Ticks fehlgeschlagen')
}

function clipTrackItemType(ppro) {
  return ppro?.Constants?.TrackItemType?.CLIP ?? 1
}

/** Premiere TickTime → ms (best-effort across API shapes). */
export function tickTimeToMs(tick) {
  if (tick == null) return null
  try {
    if (typeof tick.seconds === 'number' && Number.isFinite(tick.seconds)) {
      return Math.max(0, Math.round(tick.seconds * 1000))
    }
    if (typeof tick.asSeconds === 'function') {
      const s = tick.asSeconds()
      if (typeof s === 'number' && Number.isFinite(s)) return Math.max(0, Math.round(s * 1000))
    }
    if (typeof tick.getSeconds === 'function') {
      const s = tick.getSeconds()
      if (typeof s === 'number' && Number.isFinite(s)) return Math.max(0, Math.round(s * 1000))
    }
    const ticksRaw = tick.ticks ?? tick.tickTime
    if (ticksRaw != null) {
      const ticks = Number(ticksRaw)
      // Premiere tick scale: 254016000000 ticks/second
      if (Number.isFinite(ticks) && ticks >= 0) {
        return Math.max(0, Math.round((ticks / 254_016_000_000) * 1000))
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

async function readTrackItemName(item) {
  try {
    if (typeof item.getName === 'function') {
      const n = await item.getName()
      if (n != null && String(n).trim()) return String(n)
    }
  } catch {
    /* fall through */
  }
  try {
    if (item.name != null) return String(item.name)
  } catch {
    /* ignore */
  }
  return ''
}

async function readTickMs(item, getterName, propName) {
  try {
    if (typeof item[getterName] === 'function') {
      const raw = item[getterName]()
      const value = raw && typeof raw.then === 'function' ? await raw : raw
      const ms = tickTimeToMs(value)
      if (ms != null) return ms
    }
  } catch {
    /* fall through */
  }
  try {
    if (item[propName] != null) {
      const ms = tickTimeToMs(item[propName])
      if (ms != null) return ms
    }
  } catch {
    /* ignore */
  }
  // Some builds expose start/end as plain seconds numbers.
  try {
    const direct = item[propName]
    if (typeof direct === 'number' && Number.isFinite(direct)) {
      return Math.max(0, Math.round(direct * 1000))
    }
  } catch {
    /* ignore */
  }
  return null
}

async function readMediaPathFromTrackItem(item, ppro) {
  try {
    const projectItem =
      typeof item.getProjectItem === 'function' ? await item.getProjectItem() : item.projectItem
    if (!projectItem) return null
    const clip = ppro?.ClipProjectItem?.cast?.(projectItem) || projectItem
    if (typeof clip.getMediaFilePath === 'function') {
      const path = await clip.getMediaFilePath()
      if (path) return String(path)
    }
    if (clip.name) return String(clip.name)
  } catch {
    /* ignore */
  }
  return null
}

async function fingerprintTrackItem(item, index, ppro) {
  const name = await readTrackItemName(item)
  const mediaPath = await readMediaPathFromTrackItem(item, ppro)
  const timelineStartMs = await readTickMs(item, 'getStartTime', 'startTime')
  const timelineEndMs = await readTickMs(item, 'getEndTime', 'endTime')
  const inMs = await readTickMs(item, 'getInPoint', 'inPoint')
  const outMs = await readTickMs(item, 'getOutPoint', 'outPoint')
  const filename =
    (mediaPath ? pathBasename(mediaPath) : '') || stripSceneIdMark(name) || name
  return {
    index,
    item,
    name,
    mediaPath,
    filename,
    filenameKey: normalizeFilenameKey(filename),
    sceneId: sceneIdFromAnyText(name) || sceneIdFromAnyText(mediaPath || ''),
    mediaAssetId: mediaAssetIdFromAnyText(mediaPath || '') || mediaAssetIdFromAnyText(name),
    timelineStartMs,
    timelineEndMs,
    inMs,
    outMs,
  }
}

async function getTrackItemsFromTrack(track, ppro) {
  if (!track) return []
  const clipType = clipTrackItemType(ppro)
  const attempts = [
    () => track.getTrackItems?.(clipType, false),
    () => track.getTrackItems?.(clipType, true),
    () => track.getTrackItems?.(clipType),
    () => track.getTrackItems?.(1, false),
    () => track.getTrackItems?.(1),
    () => track.getTrackItems?.(),
    () => track.getClips?.(),
  ]
  for (const attempt of attempts) {
    if (typeof attempt !== 'function') continue
    try {
      const result = await attempt()
      if (Array.isArray(result) && result.length) return result.filter(Boolean)
    } catch {
      /* try next */
    }
  }
  return []
}

async function listVideoTracks(sequence) {
  const tracks = []
  if (!sequence) return tracks
  try {
    if (typeof sequence.getVideoTracks === 'function') {
      const list = (await sequence.getVideoTracks()) || []
      if (Array.isArray(list) && list.length) return list.filter(Boolean)
    }
  } catch {
    /* fall through */
  }
  let trackCount = 0
  try {
    if (typeof sequence.getVideoTrackCount === 'function') {
      trackCount = Number(await sequence.getVideoTrackCount()) || 0
    }
  } catch {
    trackCount = 0
  }
  for (let t = 0; t < Math.max(trackCount, 8); t += 1) {
    try {
      const track =
        typeof sequence.getVideoTrack === 'function' ? await sequence.getVideoTrack(t) : null
      if (track) tracks.push(track)
    } catch {
      /* ignore */
    }
  }
  return tracks
}

async function listAudioTracks(sequence) {
  const tracks = []
  if (!sequence) return tracks
  try {
    if (typeof sequence.getAudioTracks === 'function') {
      const list = (await sequence.getAudioTracks()) || []
      if (Array.isArray(list) && list.length) return list.filter(Boolean)
    }
  } catch {
    /* fall through */
  }
  let trackCount = 0
  try {
    if (typeof sequence.getAudioTrackCount === 'function') {
      trackCount = Number(await sequence.getAudioTrackCount()) || 0
    }
  } catch {
    trackCount = 0
  }
  for (let t = 0; t < Math.max(trackCount, 16); t += 1) {
    try {
      const track =
        typeof sequence.getAudioTrack === 'function' ? await sequence.getAudioTrack(t) : null
      if (track) tracks.push(track)
    } catch {
      /* ignore */
    }
  }
  return tracks
}

/**
 * Collect audio clip fingerprints across audio tracks (A1/A2 stereo + optional bus).
 * Flat list with stable index for pairing; trackIndex kept for diagnostics.
 */
async function listAudioTrackItems(sequence, ppro) {
  const tracks = await listAudioTracks(sequence)
  const fingerprints = []
  let flatIndex = 0
  for (let t = 0; t < tracks.length; t += 1) {
    const rawItems = await getTrackItemsFromTrack(tracks[t], ppro)
    for (const item of rawItems) {
      if (!item) continue
      const fp = await fingerprintTrackItem(item, flatIndex, ppro)
      fingerprints.push({ ...fp, trackIndex: t, kind: 'audio' })
      flatIndex += 1
    }
  }
  return fingerprints
}

function applyBoundsActions(compoundAction, item, startTick, endTick) {
  // End before start avoids transient end < start (Premiere "Invalid Parameter").
  if (typeof item.createSetEndAction === 'function') {
    compoundAction.addAction(item.createSetEndAction(endTick))
  }
  if (typeof item.createSetStartAction === 'function') {
    compoundAction.addAction(item.createSetStartAction(startTick))
  }
}

function applyInOutActions(compoundAction, item, inTick, outTick) {
  if (typeof item.createSetOutPointAction === 'function') {
    compoundAction.addAction(item.createSetOutPointAction(outTick))
  }
  if (typeof item.createSetInPointAction === 'function') {
    compoundAction.addAction(item.createSetInPointAction(inTick))
  }
}

function trackItemHasTimingActions(item) {
  return (
    typeof item?.createMoveAction === 'function' ||
    typeof item?.createSetStartAction === 'function' ||
    typeof item?.createSetEndAction === 'function' ||
    typeof item?.createSetInPointAction === 'function' ||
    typeof item?.createSetOutPointAction === 'function'
  )
}

/**
 * Apply one planned patch to a track item.
 * movedAudioHint=true when createMoveAction on video should drag linked audio.
 */
function applyPlanToItem(project, TickTime, item, plan, label) {
  if (plan.mode === 'noop') return { ok: true, mode: 'noop', movedAudioHint: false }
  if (plan.mode === 'move') {
    if (typeof item.createMoveAction !== 'function') {
      return { ok: false, error: new Error('createMoveAction fehlt'), mode: 'move' }
    }
    const deltaSec = Number(plan.deltaMs) / 1000
    if (!Number.isFinite(deltaSec) || deltaSec === 0) {
      return { ok: true, mode: 'noop', movedAudioHint: false }
    }
    let deltaTick
    try {
      deltaTick = TickTime.createWithSeconds(deltaSec)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err : new Error(String(err)), mode: 'move' }
    }
    const result = runLockedTransaction(project, label, (compoundAction) => {
      compoundAction.addAction(item.createMoveAction(deltaTick))
    })
    return {
      ok: result.ok,
      error: result.error,
      mode: 'move',
      movedAudioHint: result.ok,
    }
  }

  let startTick
  let endTick
  try {
    startTick = makeTickTime(TickTime, plan.timelineStartMs)
    endTick = makeTickTime(TickTime, plan.timelineEndMs)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)), mode: 'set_bounds' }
  }
  if (plan.timelineEndMs <= plan.timelineStartMs) {
    return { ok: false, error: new Error('timeline end <= start'), mode: 'set_bounds' }
  }

  const bounds = runLockedTransaction(project, `${label} bounds`, (compoundAction) => {
    applyBoundsActions(compoundAction, item, startTick, endTick)
  })
  if (!bounds.ok) {
    return { ok: false, error: bounds.error || new Error('setStart/setEnd failed'), mode: 'set_bounds' }
  }

  if (plan.applyInOut) {
    try {
      const inTick = makeTickTime(TickTime, plan.startMs)
      const outTick = makeTickTime(TickTime, plan.endMs)
      const io = runLockedTransaction(project, `${label} in/out`, (compoundAction) => {
        applyInOutActions(compoundAction, item, inTick, outTick)
      })
      if (!io.ok) {
        return {
          ok: true,
          mode: 'set_bounds',
          movedAudioHint: false,
          warning: io.error?.message || 'In/Out nicht gesetzt',
        }
      }
    } catch (err) {
      return {
        ok: true,
        mode: 'set_bounds',
        movedAudioHint: false,
        warning: err instanceof Error ? err.message : String(err),
      }
    }
  }

  return { ok: true, mode: 'set_bounds', movedAudioHint: false }
}

function trackNameLooksLikeV1(name) {
  const n = String(name || '')
    .trim()
    .toLowerCase()
  return !n || n === 'v1' || n === 'video 1' || n === 'video1' || n.startsWith('v1 ')
}

/**
 * Collect V1 (or best matching) video clip track items, sorted by timeline start.
 */
async function listVideoTrackItems(sequence, ppro, preferredCount = 0) {
  const tracks = await listVideoTracks(sequence)
  if (!tracks.length) return []

  /** @type {Array<{ trackIndex: number, trackName: string, items: any[] }>} */
  const perTrack = []
  for (let t = 0; t < tracks.length; t += 1) {
    const track = tracks[t]
    let trackName = ''
    try {
      trackName = String(track.name || (await track.getName?.()) || '')
    } catch {
      trackName = String(track.name || '')
    }
    const rawItems = await getTrackItemsFromTrack(track, ppro)
    perTrack.push({ trackIndex: t, trackName, items: rawItems })
  }

  // Prefer named V1 / index 0 when it has clips
  let chosen =
    perTrack.find((row) => trackNameLooksLikeV1(row.trackName) && row.items.length) ||
    perTrack.find((row) => row.trackIndex === 0 && row.items.length) ||
    null

  // If preferred scene count known, pick track whose clip count matches exactly
  if (preferredCount > 0) {
    const exact = perTrack.find((row) => row.items.length === preferredCount)
    if (exact) chosen = exact
    else if (!chosen?.items?.length) {
      // Closest count ≥ preferred
      const ranked = [...perTrack]
        .filter((row) => row.items.length > 0)
        .sort(
          (a, b) =>
            Math.abs(a.items.length - preferredCount) - Math.abs(b.items.length - preferredCount),
        )
      chosen = ranked[0] || chosen
    }
  }

  if (!chosen?.items?.length) {
    chosen = perTrack.find((row) => row.items.length) || null
  }
  if (!chosen?.items?.length) return []

  const fingerprints = []
  for (let i = 0; i < chosen.items.length; i += 1) {
    fingerprints.push(await fingerprintTrackItem(chosen.items[i], i, ppro))
  }

  // Sort by timeline when available, keep stable index for pairing via fingerprint.index
  const ordered = [...fingerprints].sort((a, b) => {
    if (a.timelineStartMs != null && b.timelineStartMs != null) {
      return a.timelineStartMs - b.timelineStartMs
    }
    return a.index - b.index
  })
  // Re-index after sort so "order" matches timeline order
  return ordered.map((fp, index) => ({ ...fp, index, trackIndex: chosen.trackIndex }))
}

async function resolveLinkedSequence(project, link) {
  const active = await project.getActiveSequence()
  if (active && sequenceMatchesLink(active, link)) return active
  if (typeof project.getSequences !== 'function') return active || null
  const sequences = (await project.getSequences()) || []
  for (const seq of sequences) {
    if (sequenceMatchesLink(seq, link)) return seq
  }
  return active || null
}

/**
 * After ZIP import: rename V1 + linked audio clips so later patches find scene ids.
 */
export async function stampSceneIdsOnLinkedSequence(input) {
  const { cut, scenes, link } = input
  if (!scenes?.length) return { ok: false, stamped: 0, message: 'Keine Scenes' }

  const ppro = await getPremiereApi()
  if (!ppro?.Project) return { ok: false, stamped: 0, message: 'Premiere UXP API fehlt' }

  const project = await ppro.Project.getActiveProject()
  if (!project) return { ok: false, stamped: 0, message: 'Kein aktives Projekt' }

  const sequence = await resolveLinkedSequence(project, link || { sequenceName: cut?.name })
  if (!sequence) return { ok: false, stamped: 0, message: 'Sequenz nicht gefunden' }

  const trackItems = await listVideoTrackItems(sequence, ppro, scenes.length)
  const paired = matchScenesToClips(scenes, trackItems)
  if (!paired.ok || !paired.pairs.length) {
    return { ok: false, stamped: 0, message: paired.message || 'Stamp pairing failed' }
  }

  const audioItems = await listAudioTrackItems(sequence, ppro)
  const usedAudio = new Set()

  let stamped = 0
  for (const { scene, itemIndex } of paired.pairs) {
    const fp = trackItems[itemIndex]
    const item = fp?.item
    if (item && typeof item.createSetNameAction === 'function') {
      const current = fp.name || ''
      const base = stripSceneIdMark(current) || stripSceneIdMark(fp.filename) || 'clip'
      const next = encodeClipDisplayName(base, scene.id)
      if (next === current) {
        stamped += 1
      } else {
        const stampedTx = runLockedTransaction(project, `VIDEON: Stamp V ${scene.id.slice(0, 8)}`, (compoundAction) => {
          compoundAction.addAction(item.createSetNameAction(next))
        })
        if (stampedTx.ok) stamped += 1
      }
    }

    const audioIndices = selectLinkedAudioClips(scene, fp, audioItems, usedAudio)
    for (const ai of audioIndices) {
      usedAudio.add(ai)
      const afp = audioItems[ai]
      const aitem = afp?.item
      if (!aitem || typeof aitem.createSetNameAction !== 'function') continue
      const current = afp.name || ''
      const base = stripSceneIdMark(current) || stripSceneIdMark(afp.filename) || 'clip'
      const next = encodeClipDisplayName(base, scene.id)
      if (next === current) {
        stamped += 1
        continue
      }
      const stampedTx = runLockedTransaction(project, `VIDEON: Stamp A ${scene.id.slice(0, 8)}`, (compoundAction) => {
        compoundAction.addAction(aitem.createSetNameAction(next))
      })
      if (stampedTx.ok) stamped += 1
    }
  }

  return {
    ok: stamped > 0,
    stamped,
    mode: paired.mode,
    message: stamped ? `${stamped} Clip-Name(n) mit Scene-ID gestempelt` : 'Kein Clip gestempelt',
  }
}

/**
 * @param {{
 *   cut: { id: string, name?: string, frameRate?: number|null },
 *   scenes: Array<{ id: string, mediaAssetId: string, startMs: number, endMs: number, timelineStartMs?: number }>,
 *   link: object|null,
 * }} input
 */
export async function patchLinkedSequenceFromCut(input) {
  const { cut, scenes, link } = input
  if (!scenes?.length) {
    return { ok: false, mode: 'patch_rejected', message: 'Keine Scenes zum Patch.' }
  }

  const ppro = await getPremiereApi()
  if (!ppro?.Project) {
    return { ok: false, mode: 'unavailable', message: 'Premiere UXP API fehlt' }
  }

  const project = await ppro.Project.getActiveProject()
  if (!project) {
    return { ok: false, mode: 'unavailable', message: 'Kein aktives Projekt' }
  }

  const sequence = await resolveLinkedSequence(project, link || { sequenceName: cut.name })
  if (!sequence) {
    return { ok: false, mode: 'patch_rejected', message: 'Keine verknüpfte Sequenz gefunden' }
  }

  const trackItems = await listVideoTrackItems(sequence, ppro, scenes.length)
  if (!trackItems.length) {
    return { ok: false, mode: 'patch_rejected', message: 'Keine Video-Clips auf V1' }
  }

  const paired = matchScenesToClips(scenes, trackItems)
  if (!paired.ok) {
    return {
      ok: false,
      mode: 'patch_rejected',
      message: paired.message || 'Clips nicht zuordenbar',
      missingSceneIds: paired.missingSceneIds,
      diagnostics: paired.diagnostics,
    }
  }

  const TickTime = ppro.TickTime
  if (!TickTime?.createWithSeconds) {
    return { ok: false, mode: 'unavailable', message: 'TickTime API fehlt' }
  }

  const audioItems = await listAudioTrackItems(sequence, ppro)
  const usedAudio = new Set()

  let patchedVideo = 0
  let patchedAudio = 0
  let moveCount = 0
  const errors = []
  const warnings = []

  for (const { scene, itemIndex } of paired.pairs) {
    const videoFp = trackItems[itemIndex]
    const item = videoFp?.item
    if (!item) continue
    if (!trackItemHasTimingActions(item)) {
      return {
        ok: false,
        mode: 'unavailable',
        message: 'TrackItem Move/SetStart/SetEnd Actions fehlen',
      }
    }

    const timing = sanitizeSceneTiming(scene)
    const plan = planClipPatch(timing, videoFp)
    const applied = applyPlanToItem(
      project,
      TickTime,
      item,
      plan,
      `VIDEON: Patch V ${String(scene.id).slice(0, 8)}`,
    )

    if (!applied.ok) {
      errors.push(
        `${scene.id.slice(0, 8)}: ${applied.error?.message || 'Patch fehlgeschlagen'} (${plan.mode})`,
      )
      continue
    }
    if (applied.warning) warnings.push(applied.warning)
    if (plan.mode === 'noop') {
      patchedVideo += 1
      continue
    }
    patchedVideo += 1
    if (applied.mode === 'move') moveCount += 1

    // createMoveAction on video usually drags linked audio — skip explicit audio moves.
    if (applied.movedAudioHint) {
      const linked = selectLinkedAudioClips(scene, videoFp, audioItems, usedAudio)
      for (const ai of linked) usedAudio.add(ai)
      patchedAudio += linked.length
      continue
    }

    // Trim / set_bounds: update matched audio with bounds only (no In/Out).
    const audioIndices = selectLinkedAudioClips(scene, videoFp, audioItems, usedAudio)
    for (const ai of audioIndices) usedAudio.add(ai)
    const audioPlan = {
      mode: 'set_bounds',
      timelineStartMs: timing.timelineStartMs,
      timelineEndMs: timing.timelineEndMs,
      startMs: timing.startMs,
      endMs: timing.endMs,
      applyInOut: false,
    }
    for (const ai of audioIndices) {
      const aitem = audioItems[ai]?.item
      if (!aitem || !trackItemHasTimingActions(aitem)) continue
      const audioApplied = applyPlanToItem(
        project,
        TickTime,
        aitem,
        audioPlan,
        `VIDEON: Patch A ${String(scene.id).slice(0, 8)}`,
      )
      if (audioApplied.ok) patchedAudio += 1
      else if (audioApplied.error) {
        warnings.push(`Audio ${ai}: ${audioApplied.error.message}`)
      }
    }
  }

  if (patchedVideo === 0) {
    return {
      ok: false,
      mode: 'patch_rejected',
      message: errors[0] || 'Kein Clip gepatcht',
      errors,
    }
  }

  try {
    await stampSceneIdsOnLinkedSequence({ cut, scenes, link })
  } catch {
    /* ignore stamp failures */
  }

  const modeLabel =
    paired.mode === 'by_scene_id'
      ? ''
      : paired.mode === 'by_order'
        ? ' · Zuordnung nach Reihenfolge'
        : paired.mode === 'hybrid'
          ? ' · Hybrid-Match'
          : ' · Multi-Signal-Match'
  const moveNote = moveCount ? ` · ${moveCount}× Move` : ''
  const audioNote =
    patchedAudio > 0
      ? ` · ${patchedAudio} Audio`
      : audioItems.length
        ? ' · Audio nicht zuordenbar'
        : ''
  return {
    ok: true,
    mode: 'in_place_patch',
    matchMode: paired.mode,
    message: `${patchedVideo} Video-Clip(s) in Premiere aktualisiert (Effekte bleiben)${moveNote}${audioNote}${modeLabel}.`,
    patched: patchedVideo,
    patchedAudio,
    extraClips: paired.extraClips,
    errors: errors.length ? errors : undefined,
    warnings: warnings.length ? warnings : undefined,
  }
}
