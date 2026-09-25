/**
 * Premiere Pro host adapter (Wave 1, UXP API ≥ 25.6).
 * Spec: adobe-uxp-library-panel.md
 * Knowledge: adobe-uxp-scenes-provider-polish.md
 *
 * Flow: ensure Bin → importFiles(suppressUI, bin, false) → find clip by path
 *     → clear + set In/Out (scene range) → optional Sequence insert at playhead.
 */

import { loadNativeModule } from './native.js'
import { sceneInOutFrames } from './time.js'
import { assertLocalImportPath, pathBasename, pathsLikelyMatch } from './premiere-path.js'

const CLIP_SETTLE_MS = [0, 150, 400, 800]

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
    error = err instanceof Error ? err.message : String(err)
    ok = false
  }
  return { ok: Boolean(ok), error }
}

async function listFolderItems(folder) {
  if (!folder || typeof folder.getItems !== 'function') return []
  return (await folder.getItems()) || []
}

/**
 * Find a FolderItem by name under root (non-recursive first, then one-level walk).
 */
export async function findBinByName(ppro, root, binName) {
  const want = String(binName || 'VIDEON').trim() || 'VIDEON'
  const queue = [root]
  while (queue.length) {
    const folder = queue.shift()
    const items = await listFolderItems(folder)
    for (const item of items) {
      if (item?.name === want) {
        const asFolder = ppro.FolderItem?.cast?.(item) || item
        if (asFolder && typeof asFolder.getItems === 'function') return asFolder
      }
      const nested = ppro.FolderItem?.cast?.(item)
      if (nested) queue.push(nested)
    }
  }
  return null
}

export async function ensureBin(ppro, project, binName) {
  const root = await project.getRootItem()
  if (!root) throw new Error('Projekt-Root nicht verfügbar')

  const existing = await findBinByName(ppro, root, binName)
  if (existing) return existing

  const name = String(binName || 'VIDEON').trim() || 'VIDEON'
  if (typeof root.createBinAction !== 'function') {
    return root
  }

  runLockedTransaction(project, `VIDEON: Bin „${name}“`, (compoundAction) => {
    compoundAction.addAction(root.createBinAction(name, false))
  })

  const created = await findBinByName(ppro, root, name)
  return created || root
}

async function walkProjectItems(ppro, root) {
  const out = []
  const queue = [root]
  while (queue.length) {
    const folder = queue.shift()
    const items = await listFolderItems(folder)
    for (const item of items) {
      out.push(item)
      const nested = ppro.FolderItem?.cast?.(item)
      if (nested) queue.push(nested)
    }
  }
  return out
}

async function matchClipInItems(ppro, items, filePath) {
  const base = pathBasename(filePath)
  for (const item of items) {
    const clip = ppro.ClipProjectItem?.cast?.(item)
    if (!clip) continue
    let mediaPath = null
    try {
      mediaPath =
        typeof clip.getMediaFilePath === 'function' ? await clip.getMediaFilePath() : null
    } catch {
      mediaPath = null
    }
    if (mediaPath && pathsLikelyMatch(mediaPath, filePath)) return clip
    if (!mediaPath && item.name && item.name === base) return clip
  }

  for (const item of items) {
    const clip = ppro.ClipProjectItem?.cast?.(item)
    if (!clip || typeof clip.findItemsMatchingMediaPath !== 'function') continue
    try {
      const matches = await clip.findItemsMatchingMediaPath(filePath, true)
      if (Array.isArray(matches) && matches.length) {
        return ppro.ClipProjectItem.cast(matches[0]) || matches[0]
      }
      const byName = await clip.findItemsMatchingMediaPath(base, true)
      if (Array.isArray(byName) && byName.length) {
        return ppro.ClipProjectItem.cast(byName[0]) || byName[0]
      }
    } catch {
      /* try next */
    }
  }
  return null
}

export async function findClipMatchingPath(ppro, project, filePath, preferredBin = null) {
  if (preferredBin) {
    const binItems = await listFolderItems(preferredBin)
    const inBin = await matchClipInItems(ppro, binItems, filePath)
    if (inBin) return inBin
  }

  const root = await project.getRootItem()
  const items = await walkProjectItems(ppro, root)
  return matchClipInItems(ppro, items, filePath)
}

async function resolveClipAfterImport(ppro, project, localPath, bin) {
  for (const wait of CLIP_SETTLE_MS) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    const clip = await findClipMatchingPath(ppro, project, localPath, bin)
    if (clip) return clip
  }
  return null
}

function secondsFromMs(ms) {
  return Math.max(0, Number(ms) || 0) / 1000
}

function tickFromSeconds(ppro, seconds) {
  if (typeof ppro.TickTime?.createWithSeconds === 'function') {
    return ppro.TickTime.createWithSeconds(seconds)
  }
  return null
}

/**
 * Best-effort footage FPS for frame conversion / messaging.
 */
export async function resolveClipFps(clip) {
  try {
    if (typeof clip.getFootageInterpretation === 'function') {
      const interp = await clip.getFootageInterpretation()
      const rate =
        Number(interp?.frameRate) ||
        Number(interp?.frameRate?.value) ||
        (typeof interp?.getFrameRate === 'function' ? Number(await interp.getFrameRate()) : NaN)
      if (Number.isFinite(rate) && rate > 0) return rate
    }
  } catch {
    /* fall through */
  }
  return 25
}

async function readClipInOutSeconds(ppro, clip) {
  try {
    const mediaType = ppro.Constants?.MediaType?.VIDEO
    const inTick =
      typeof clip.getInPoint === 'function'
        ? await clip.getInPoint(mediaType ?? undefined)
        : null
    const outTick =
      typeof clip.getOutPoint === 'function'
        ? await clip.getOutPoint(mediaType ?? undefined)
        : null
    const inSec =
      inTick && typeof inTick.seconds === 'number'
        ? inTick.seconds
        : inTick && typeof inTick.getSeconds === 'function'
          ? Number(inTick.getSeconds())
          : null
    const outSec =
      outTick && typeof outTick.seconds === 'number'
        ? outTick.seconds
        : outTick && typeof outTick.getSeconds === 'function'
          ? Number(outTick.getSeconds())
          : null
    return {
      inSec: Number.isFinite(inSec) ? inSec : null,
      outSec: Number.isFinite(outSec) ? outSec : null,
    }
  } catch {
    return { inSec: null, outSec: null }
  }
}

export async function applySceneInOut(ppro, project, clip, hit) {
  if (!clip || typeof clip.createSetInOutPointsAction !== 'function') {
    return { applied: false, reason: 'createSetInOutPointsAction unavailable', verified: false }
  }
  if (hit.startMs == null || hit.endMs == null || hit.endMs <= hit.startMs) {
    return { applied: false, reason: 'no scene bounds', verified: false }
  }

  const inPoint = tickFromSeconds(ppro, secondsFromMs(hit.startMs))
  const outPoint = tickFromSeconds(ppro, secondsFromMs(hit.endMs))
  if (!inPoint || !outPoint) {
    return { applied: false, reason: 'TickTime.createWithSeconds unavailable', verified: false }
  }

  const { ok, error } = runLockedTransaction(project, 'VIDEON: Scene In/Out', (compoundAction) => {
    if (typeof clip.createClearInOutPointsAction === 'function') {
      try {
        compoundAction.addAction(clip.createClearInOutPointsAction())
      } catch {
        /* optional clear */
      }
    }
    compoundAction.addAction(clip.createSetInOutPointsAction(inPoint, outPoint))
  })

  if (!ok) {
    return {
      applied: false,
      reason: error || 'transaction failed',
      verified: false,
    }
  }

  const expectedIn = secondsFromMs(hit.startMs)
  const expectedOut = secondsFromMs(hit.endMs)
  const { inSec, outSec } = await readClipInOutSeconds(ppro, clip)
  let verified = false
  if (inSec != null && outSec != null) {
    verified = Math.abs(inSec - expectedIn) < 0.05 && Math.abs(outSec - expectedOut) < 0.05
  }

  return {
    applied: true,
    reason: verified ? null : inSec == null ? 'set without verify API' : 'set; verify mismatch',
    verified,
    inSec,
    outSec,
  }
}

async function resolveInsertTime(ppro, sequence) {
  try {
    if (typeof sequence.getPlayerPosition === 'function') {
      const pos = await sequence.getPlayerPosition()
      if (pos) return pos
    }
  } catch {
    /* fall through */
  }
  return ppro.TickTime?.TIME_ZERO || ppro.TickTime.createWithSeconds(0)
}

/** Prefer underlying ProjectItem when SequenceEditor wants ProjectItem not ClipProjectItem. */
function projectItemForInsert(clip) {
  return clip?.projectItem || clip
}

export async function appendClipToActiveSequence(ppro, project, clipProjectItem) {
  const sequence = await project.getActiveSequence()
  if (!sequence) {
    return { ok: false, mode: 'no_sequence', message: 'Keine aktive Sequence' }
  }
  if (!ppro.SequenceEditor?.getEditor) {
    return { ok: false, mode: 'no_api', message: 'SequenceEditor API fehlt' }
  }

  let editor = ppro.SequenceEditor.getEditor(sequence)
  if (editor && typeof editor.then === 'function') {
    editor = await editor
  }
  if (!editor) {
    return { ok: false, mode: 'no_editor', message: 'SequenceEditor nicht verfügbar' }
  }

  const at = await resolveInsertTime(ppro, sequence)
  const item = projectItemForInsert(clipProjectItem)

  const insertResult = runLockedTransaction(project, 'VIDEON: Sequence Insert', (compoundAction) => {
    if (typeof editor.createInsertProjectItemAction !== 'function') {
      throw new Error('createInsertProjectItemAction fehlt')
    }
    const action = editor.createInsertProjectItemAction(
      item,
      at,
      0, // V1
      0, // A1
      true, // limitShift
    )
    compoundAction.addAction(action)
  })

  if (insertResult.ok) {
    return { ok: true, mode: 'insert', message: 'Auf Sequence eingefügt (Insert)' }
  }

  if (typeof editor.createOverwriteItemAction === 'function') {
    const overwriteResult = runLockedTransaction(
      project,
      'VIDEON: Sequence Overwrite',
      (compoundAction) => {
        const action = editor.createOverwriteItemAction(item, at, 0, 0)
        compoundAction.addAction(action)
      },
    )
    if (overwriteResult.ok) {
      return { ok: true, mode: 'overwrite', message: 'Auf Sequence eingefügt (Overwrite)' }
    }
    return {
      ok: false,
      mode: 'failed',
      message: `Sequence-Insert fehlgeschlagen${overwriteResult.error ? `: ${overwriteResult.error}` : ''}`,
    }
  }

  return {
    ok: false,
    mode: 'failed',
    message: insertResult.error
      ? `Sequence-Insert fehlgeschlagen: ${insertResult.error}`
      : 'Sequence-Insert fehlgeschlagen',
  }
}

/**
 * @param {{ filePath: string, binName: string, hit: object, appendToSequence: boolean }} input
 */
export async function insertHitIntoPremiere(input) {
  const { filePath, binName, hit, appendToSequence } = input
  const localPath = assertLocalImportPath(filePath)
  const ppro = await getPremiereApi()

  if (!ppro) {
    console.info('[VIDEON] premierepro module unavailable; would import', {
      filePath: localPath,
      binName,
      hitId: hit.id,
      appendToSequence,
      inOut: sceneInOutFrames(hit, 25),
    })
    return {
      ok: true,
      mode: 'stub',
      message: `Host-API nicht verfügbar — Datei bereit: ${localPath}`,
    }
  }

  try {
    const project = await ppro.Project.getActiveProject()
    if (!project) throw new Error('Kein aktives Premiere-Projekt')
    if (typeof project.importFiles !== 'function') {
      throw new Error('importFiles fehlt — Premiere UXP ≥ 25.6 nötig')
    }

    const bin = await ensureBin(ppro, project, binName || 'VIDEON')

    // null (not undefined) for root when bin missing — Adobe quirk
    const targetBin = bin || null
    const imported = await project.importFiles([localPath], true, targetBin, false)
    if (imported === false) {
      throw new Error('importFiles hat false zurückgegeben')
    }

    const clip = await resolveClipAfterImport(ppro, project, localPath, bin)
    if (!clip) {
      return {
        ok: true,
        mode: 'imported-unresolved',
        message: `Importiert, Clip nicht auflösbar — prüfe Bin „${binName || 'VIDEON'}“`,
      }
    }

    const inOut = await applySceneInOut(ppro, project, clip, hit)
    const fps = await resolveClipFps(clip)

    let sequenceNote = ''
    let sequenceOk = null
    if (appendToSequence) {
      const seq = await appendClipToActiveSequence(ppro, project, clip)
      sequenceOk = seq.ok
      sequenceNote = seq.ok ? `; ${seq.message}` : `; Sequence: ${seq.message}`
    }

    const timing =
      inOut.applied && hit.startMs != null && hit.endMs != null
        ? ` (${secondsFromMs(hit.startMs).toFixed(2)}s–${secondsFromMs(hit.endMs).toFixed(2)}s)`
        : ''

    let inOutNote = ''
    if (hit.startMs != null && hit.endMs != null && hit.endMs > hit.startMs) {
      if (!inOut.applied) {
        inOutNote = ` · In/Out nicht gesetzt (${inOut.reason || 'fehlgeschlagen'})`
      } else if (!inOut.verified) {
        inOutNote = ' · In/Out gesetzt'
      }
    } else {
      inOutNote = ' · voller Clip (keine Szenen-Bounds)'
    }

    return {
      ok: true,
      mode: 'imported',
      inOutApplied: Boolean(inOut.applied),
      inOutVerified: Boolean(inOut.verified),
      sequenceOk,
      fps,
      message: `Importiert in „${binName || 'VIDEON'}“${timing}${inOutNote}${sequenceNote}`,
    }
  } catch (error) {
    return {
      ok: false,
      mode: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
