/**
 * Premiere Open Cut host adapter — Wave B reveal + Wave C auto_import + linked replace.
 * Spec: adobe-uxp-open-cut-premiere.md · adobe-uxp-cut-pushback-premiere.md
 *
 * Primary: Project.importFiles([xmlNativePath]) for XMEML packages.
 * Refresh: import new sequence, then delete previously linked sequences (no duplicates).
 * Fallback: reveal_and_prompt (clipboard + openPath).
 */

import { loadNativeModule } from './native.js'
import { isAfterEffectsHost } from './host.js'
import { OPEN_CUT_HANDOFF_BANNER } from './open-cut-model.js'
import { assertLocalImportPath, pathBasename } from './premiere-path.js'
import { ensureBin } from './premiere.js'

async function getPremiereApi() {
  try {
    return await loadNativeModule('premierepro')
  } catch {
    return null
  }
}

async function copyToClipboard(text) {
  try {
    const uxp = await loadNativeModule('uxp')
    if (uxp?.clipboard?.writeText) {
      await uxp.clipboard.writeText(String(text))
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(text))
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

async function revealPath(path) {
  if (!path) return false
  try {
    const uxp = await loadNativeModule('uxp')
    if (typeof uxp?.shell?.openPath === 'function') {
      await uxp.shell.openPath(path)
      return true
    }
    if (typeof uxp?.shell?.showItemInFolder === 'function') {
      await uxp.shell.showItemInFolder(path)
      return true
    }
  } catch (error) {
    console.warn('[VIDEON] revealPath failed', error)
  }
  return false
}

export function sequenceKey(seq) {
  if (!seq) return ''
  try {
    if (seq.guid != null) return String(seq.guid)
  } catch {
    /* ignore */
  }
  try {
    if (typeof seq.getId === 'function') return String(seq.getId())
  } catch {
    /* ignore */
  }
  return String(seq.name || '')
}

export function sequenceMatchesLink(seq, link) {
  if (!seq || !link) return false
  const guid = link.sequenceGuid || link.guid
  if (guid) {
    try {
      if (seq.guid != null && String(seq.guid) === String(guid)) return true
    } catch {
      /* ignore */
    }
  }
  const want = String(link.sequenceName || '')
    .trim()
    .toLowerCase()
  if (!want) return false
  const name = String(seq.name || '')
    .trim()
    .toLowerCase()
  if (!name) return false
  return name === want || name.startsWith(`${want} `) || name.includes(want)
}

async function listSequenceSnapshot(project) {
  if (typeof project.getSequences !== 'function') return []
  try {
    const list = await project.getSequences()
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

async function executeProjectActions(project, buildActions, label) {
  if (!project || typeof project.executeTransaction !== 'function') return false
  const run = async () => {
    await project.executeTransaction(async (compAction) => {
      for (const build of buildActions) {
        const action = typeof build === 'function' ? build() : null
        if (!action) continue
        if (compAction && typeof compAction.addAction === 'function') {
          compAction.addAction(action)
        } else if (typeof action === 'function') {
          action()
        }
      }
    }, label || 'VIDEON')
  }
  try {
    if (typeof project.lockedAccess === 'function') {
      await project.lockedAccess(() => run())
    } else {
      await run()
    }
    return true
  } catch (error) {
    console.warn('[VIDEON] executeTransaction failed', label, error)
    return false
  }
}

/**
 * Best-effort delete of a sequence (UXP varies by Premiere version).
 */
export async function deleteSequenceBestEffort(project, sequence) {
  if (!project || !sequence) return false

  if (typeof project.deleteSequence === 'function') {
    try {
      await project.deleteSequence(sequence)
      return true
    } catch (error) {
      console.warn('[VIDEON] project.deleteSequence failed', error)
    }
  }

  try {
    const item =
      typeof sequence.getProjectItem === 'function' ? await sequence.getProjectItem() : null
    if (!item) return false
    const parent =
      typeof item.getParentBin === 'function'
        ? item.getParentBin()
        : typeof item.parent === 'object'
          ? item.parent
          : null
    if (parent && typeof parent.createRemoveItemAction === 'function') {
      const ok = await executeProjectActions(
        project,
        [() => parent.createRemoveItemAction(item)],
        'VIDEON remove sequence',
      )
      if (ok) return true
    }
    if (typeof project.deleteAsset === 'function') {
      await project.deleteAsset(item)
      return true
    }
  } catch (error) {
    console.warn('[VIDEON] deleteSequenceBestEffort failed', error)
  }
  return false
}

async function activateSequence(project, sequence) {
  if (!sequence) return
  if (typeof project.openSequence === 'function') {
    try {
      await project.openSequence(sequence)
    } catch (error) {
      console.warn('[VIDEON] openSequence failed', error)
    }
  }
  if (typeof project.setActiveSequence === 'function') {
    try {
      await project.setActiveSequence(sequence)
    } catch {
      /* optional */
    }
  }
}

async function renameSequenceBestEffort(project, sequence, name) {
  if (!sequence || !name) return false
  try {
    if (typeof sequence.name === 'string' && sequence.name === name) return true
  } catch {
    /* ignore */
  }
  try {
    const item =
      typeof sequence.getProjectItem === 'function' ? await sequence.getProjectItem() : null
    if (item && typeof item.createSetNameAction === 'function') {
      return executeProjectActions(
        project,
        [() => item.createSetNameAction(name)],
        'VIDEON rename sequence',
      )
    }
    if (item && 'name' in item) {
      item.name = name
      return true
    }
  } catch (error) {
    console.warn('[VIDEON] renameSequenceBestEffort failed', error)
  }
  return false
}

/**
 * Wave B GA handoff.
 */
export async function revealAndPromptOpenCut(input) {
  const hostInfo = input.hostInfo || { id: 'PPRO' }
  if (isAfterEffectsHost(hostInfo) || hostInfo.id === 'AEFT') {
    return {
      ok: false,
      mode: 'unsupported',
      message: 'Open Cut ist nur in Premiere Pro verfügbar.',
    }
  }

  const xmlPath = input.xmlPath
  if (!xmlPath) {
    return { ok: false, mode: 'unsupported', message: 'XML-Pfad fehlt' }
  }

  const clipped = await copyToClipboard(xmlPath)
  const revealed = await revealPath(input.extractDir || xmlPath)
  const reason = input.reason ? `\n(${input.reason})` : ''

  return {
    ok: true,
    mode: 'reveal_and_prompt',
    xmlPath,
    extractDir: input.extractDir || null,
    cutId: input.cutId,
    exportId: input.exportId,
    clipboard: clipped,
    revealed,
    banner: OPEN_CUT_HANDOFF_BANNER,
    message: `${OPEN_CUT_HANDOFF_BANNER}\n${xmlPath}${reason}`,
  }
}

/**
 * Wave C — import XMEML; optionally remove previously linked sequences.
 */
export async function autoImportOpenCutXml(input) {
  const { xmlPath, binName, cutName, replaceLinked, link } = input
  let localPath
  try {
    localPath = assertLocalImportPath(xmlPath)
  } catch (error) {
    return {
      ok: false,
      mode: 'unavailable',
      message: error instanceof Error ? error.message : String(error),
    }
  }

  const ppro = await getPremiereApi()
  if (!ppro?.Project) {
    return {
      ok: false,
      mode: 'unavailable',
      message: 'premierepro Modul nicht verfügbar',
    }
  }

  try {
    const project = await ppro.Project.getActiveProject()
    if (!project) {
      return { ok: false, mode: 'unavailable', message: 'Kein aktives Premiere-Projekt' }
    }
    if (typeof project.importFiles !== 'function') {
      return {
        ok: false,
        mode: 'unavailable',
        message: 'importFiles fehlt — Premiere UXP ≥ 25.6 nötig',
      }
    }

    const before = await listSequenceSnapshot(project)
    const beforeKeys = new Set(before.map(sequenceKey).filter(Boolean))
    const priorLinked = replaceLinked
      ? before.filter((seq) => sequenceMatchesLink(seq, link || { sequenceName: cutName }))
      : []

    const bin = await ensureBin(ppro, project, binName || 'VIDEON')
    const imported = await project.importFiles([localPath], true, bin || null, false)
    if (imported === false) {
      return { ok: false, mode: 'unavailable', message: 'importFiles hat false zurückgegeben' }
    }

    await new Promise((r) => setTimeout(r, 250))

    const after = await listSequenceSnapshot(project)
    let created = after.find((seq) => {
      const key = sequenceKey(seq)
      return key && !beforeKeys.has(key)
    })
    if (!created && cutName) {
      const want = String(cutName).toLowerCase()
      created = after.find((seq) => String(seq?.name || '').toLowerCase().includes(want))
    }
    if (!created && after.length > before.length) {
      created = after[after.length - 1]
    }

    let removed = 0
    if (replaceLinked && priorLinked.length) {
      const createdKey = sequenceKey(created)
      for (const seq of priorLinked) {
        if (createdKey && sequenceKey(seq) === createdKey) continue
        const ok = await deleteSequenceBestEffort(project, seq)
        if (ok) removed += 1
      }
    }

    if (created && cutName) {
      await renameSequenceBestEffort(project, created, cutName)
    }
    await activateSequence(project, created)

    let sequenceGuid = null
    try {
      if (created?.guid != null) sequenceGuid = String(created.guid)
    } catch {
      /* ignore */
    }

    const sequenceName =
      created?.name || pathBasename(localPath).replace(/\.xml$/i, '') || cutName || null
    const replaceNote =
      replaceLinked && removed
        ? ` · ${removed} alte Sequenz(en) entfernt`
        : replaceLinked
          ? ' · ersetzt (keine alte Sequenz gefunden)'
          : ''
    return {
      ok: true,
      mode: 'auto_import',
      sequenceName,
      sequenceGuid,
      removedPrior: removed,
      message: sequenceName
        ? `Sequenz importiert: ${sequenceName}${replaceNote}`
        : `XMEML importiert (${pathBasename(localPath)}) — Sequenz in Projekt prüfen${replaceNote}`,
    }
  } catch (error) {
    return {
      ok: false,
      mode: 'unavailable',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Try auto_import; on failure fall down to reveal_and_prompt (honesty ladder).
 */
export async function openCutInPremiere(input) {
  const hostInfo = input.hostInfo || { id: 'PPRO' }
  if (isAfterEffectsHost(hostInfo) || hostInfo.id === 'AEFT') {
    return {
      ok: false,
      mode: 'unsupported',
      message: 'Open Cut ist nur in Premiere Pro verfügbar.',
    }
  }

  const auto = await autoImportOpenCutXml({
    xmlPath: input.xmlPath,
    binName: input.binName || 'VIDEON',
    cutName: input.cutName,
    replaceLinked: Boolean(input.replaceLinked),
    link: input.link || null,
  })

  if (auto.ok) {
    return {
      ok: true,
      mode: 'auto_import',
      xmlPath: input.xmlPath,
      extractDir: input.extractDir || null,
      cutId: input.cutId,
      exportId: input.exportId,
      sequenceName: auto.sequenceName || null,
      sequenceGuid: auto.sequenceGuid || null,
      removedPrior: auto.removedPrior || 0,
      message: auto.message,
    }
  }

  console.warn('[VIDEON] auto_import failed → reveal_and_prompt', auto.message)
  return revealAndPromptOpenCut({
    ...input,
    reason: `Auto-Import: ${auto.message}`,
  })
}
