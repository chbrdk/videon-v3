/**
 * Premiere Open Cut host adapter — Wave B reveal + Wave C auto_import.
 * Spec: adobe-uxp-open-cut-premiere.md
 *
 * Primary: Project.importFiles([xmlNativePath]) for XMEML packages.
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

function sequenceKey(seq) {
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

async function listSequenceSnapshot(project) {
  if (typeof project.getSequences !== 'function') return []
  try {
    const list = await project.getSequences()
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/**
 * Wave B GA handoff.
 * @param {{ xmlPath: string, extractDir?: string, cutId: string, exportId: string, hostInfo?: { id: string }, reason?: string }} input
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
 * Wave C — try importing XMEML via importFiles.
 * @returns {Promise<{ ok: boolean, mode: string, message: string, sequenceName?: string|null }>}
 */
export async function autoImportOpenCutXml(input) {
  const { xmlPath, binName, cutName } = input
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

    const bin = await ensureBin(ppro, project, binName || 'VIDEON')
    const imported = await project.importFiles([localPath], true, bin || null, false)
    if (imported === false) {
      return { ok: false, mode: 'unavailable', message: 'importFiles hat false zurückgegeben' }
    }

    // Settle — project panel / sequence list can lag
    await new Promise((r) => setTimeout(r, 200))

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

    if (created && typeof project.openSequence === 'function') {
      try {
        await project.openSequence(created)
      } catch (error) {
        console.warn('[VIDEON] openSequence after Open Cut failed', error)
      }
    }
    if (created && typeof project.setActiveSequence === 'function') {
      try {
        await project.setActiveSequence(created)
      } catch {
        /* optional */
      }
    }

    const sequenceName = created?.name || pathBasename(localPath).replace(/\.xml$/i, '') || cutName || null
    return {
      ok: true,
      mode: 'auto_import',
      sequenceName,
      message: sequenceName
        ? `Sequenz importiert: ${sequenceName}`
        : `XMEML importiert (${pathBasename(localPath)}) — Sequenz in Projekt prüfen`,
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
      message: auto.message,
    }
  }

  console.warn('[VIDEON] auto_import failed → reveal_and_prompt', auto.message)
  return revealAndPromptOpenCut({
    ...input,
    reason: `Auto-Import: ${auto.message}`,
  })
}
