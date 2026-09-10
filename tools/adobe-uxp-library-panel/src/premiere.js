/**
 * Premiere Pro host adapter (Wave 1, UXP API ≥ 25.6).
 * Spec: adobe-uxp-library-panel.md
 *
 * Flow: ensure Bin → importFiles(suppressUI, bin, false) → find clip by path
 *     → createSetInOutPointsAction (scene range) → optional Sequence insert.
 */

import { loadNativeModule } from './native.js'
import { sceneInOutFrames } from './time.js'
import { assertLocalImportPath, pathBasename, pathsLikelyMatch } from './premiere-path.js'

async function getPremiereApi() {
  try {
    return await loadNativeModule('premierepro')
  } catch {
    return null
  }
}

function runLockedTransaction(project, name, build) {
  let ok = false
  project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => {
      build(compoundAction)
    }, name)
  })
  return ok
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

export async function findClipMatchingPath(ppro, project, filePath) {
  const root = await project.getRootItem()
  const items = await walkProjectItems(ppro, root)
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

  // Fallback: ClipProjectItem.findItemsMatchingMediaPath on any clip instance
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

function secondsFromMs(ms) {
  return Math.max(0, Number(ms) || 0) / 1000
}

export async function applySceneInOut(ppro, project, clip, hit) {
  if (!clip || typeof clip.createSetInOutPointsAction !== 'function') {
    return { applied: false, reason: 'createSetInOutPointsAction unavailable' }
  }
  if (hit.startMs == null || hit.endMs == null || hit.endMs <= hit.startMs) {
    return { applied: false, reason: 'no scene bounds' }
  }

  const inPoint = ppro.TickTime.createWithSeconds(secondsFromMs(hit.startMs))
  const outPoint = ppro.TickTime.createWithSeconds(secondsFromMs(hit.endMs))

  const ok = runLockedTransaction(project, 'VIDEON: Scene In/Out', (compoundAction) => {
    compoundAction.addAction(clip.createSetInOutPointsAction(inPoint, outPoint))
  })

  return { applied: Boolean(ok), reason: ok ? null : 'transaction failed' }
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

export async function appendClipToActiveSequence(ppro, project, clipProjectItem) {
  const sequence = await project.getActiveSequence()
  if (!sequence) {
    return { ok: false, message: 'Keine aktive Sequence' }
  }
  if (!ppro.SequenceEditor?.getEditor) {
    return { ok: false, message: 'SequenceEditor API fehlt' }
  }

  const editor = ppro.SequenceEditor.getEditor(sequence)
  const at = await resolveInsertTime(ppro, sequence)

  const ok = runLockedTransaction(project, 'VIDEON: Sequence Insert', (compoundAction) => {
    const action = editor.createInsertProjectItemAction(
      clipProjectItem,
      at,
      0, // V1
      0, // A1
      true, // limitShift
    )
    compoundAction.addAction(action)
  })

  return {
    ok: Boolean(ok),
    message: ok ? 'Auf Sequence eingefügt' : 'Sequence-Insert fehlgeschlagen',
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

    let clip = await findClipMatchingPath(ppro, project, localPath)
    if (!clip) {
      // Brief settle — project panel can lag after import
      await new Promise((r) => setTimeout(r, 150))
      clip = await findClipMatchingPath(ppro, project, localPath)
    }
    if (!clip) {
      return {
        ok: true,
        mode: 'imported-unresolved',
        message: `Importiert, Clip nicht auflösbar — prüfe Bin „${binName || 'VIDEON'}“`,
      }
    }

    const inOut = await applySceneInOut(ppro, project, clip, hit)

    let sequenceNote = ''
    if (appendToSequence) {
      const seq = await appendClipToActiveSequence(ppro, project, clip)
      sequenceNote = seq.ok ? `; ${seq.message}` : `; Sequence: ${seq.message}`
    }

    const timing =
      inOut.applied && hit.startMs != null && hit.endMs != null
        ? ` (${secondsFromMs(hit.startMs).toFixed(2)}s–${secondsFromMs(hit.endMs).toFixed(2)}s)`
        : ''

    return {
      ok: true,
      mode: 'imported',
      message: `Importiert in „${binName || 'VIDEON'}“${timing}${sequenceNote}`,
    }
  } catch (error) {
    return {
      ok: false,
      mode: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
