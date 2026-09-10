/**
 * Capture active Premiere sequence as XML for pushback.
 * Prefers ProjectConverter.exportAsFinalCutProXML (≥ 26.2); else file picker.
 */

import { loadNativeModule } from './native.js'

async function getPremiereApi() {
  try {
    return await loadNativeModule('premierepro')
  } catch {
    return null
  }
}

async function writePathInDataFolder(fileName) {
  const uxp = await loadNativeModule('uxp')
  const fs = uxp.storage?.localFileSystem
  if (!fs?.getDataFolder) throw new Error('UXP localFileSystem fehlt')
  const folder = await fs.getDataFolder()
  let pushRoot = folder
  try {
    if (typeof folder.createFolder === 'function') {
      const entries = typeof folder.getEntries === 'function' ? await folder.getEntries() : []
      const existing = entries.find((e) => e?.name === 'pushback' && e.isFolder)
      pushRoot = existing || (await folder.createFolder('pushback'))
    }
  } catch {
    pushRoot = folder
  }
  const file = await pushRoot.createFile(fileName, { overwrite: true })
  // Ensure file exists on disk for Premiere export path
  try {
    await file.write('', { format: uxp.storage.formats.utf8 })
  } catch {
    try {
      await file.write(new ArrayBuffer(0), { format: uxp.storage.formats.binary })
    } catch {
      /* Premiere may overwrite anyway */
    }
  }
  if (!file.nativePath) throw new Error('nativePath für Export fehlt')
  return file
}

async function readUtf8File(file) {
  const uxp = await loadNativeModule('uxp')
  const data = await file.read({ format: uxp.storage.formats.utf8 })
  return String(data || '')
}

/**
 * @returns {Promise<{ ok: boolean, mode: string, xml?: string, path?: string, message?: string }>}
 */
export async function captureActiveSequenceXml() {
  const ppro = await getPremiereApi()
  if (!ppro) {
    return { ok: false, mode: 'unavailable', message: 'premierepro Modul fehlt' }
  }

  try {
    const project = await ppro.Project.getActiveProject()
    if (!project) {
      return { ok: false, mode: 'unavailable', message: 'Kein aktives Premiere-Projekt' }
    }
    const sequence =
      (typeof project.getActiveSequence === 'function' && (await project.getActiveSequence())) || null
    if (!sequence) {
      return { ok: false, mode: 'unavailable', message: 'Keine aktive Sequenz' }
    }

    const Converter = ppro.ProjectConverter
    const exportFn =
      (Converter && typeof Converter.exportAsFinalCutProXML === 'function' && Converter.exportAsFinalCutProXML) ||
      (typeof project.exportAsFinalCutProXML === 'function' && project.exportAsFinalCutProXML.bind(project)) ||
      null

    if (exportFn) {
      const stamp = Date.now()
      const file = await writePathInDataFolder(`pushback-${stamp}.xml`)
      const path = file.nativePath
      let ok
      if (Converter && exportFn === Converter.exportAsFinalCutProXML) {
        ok = await Converter.exportAsFinalCutProXML(sequence, path, true)
      } else {
        ok = await exportFn(path, true)
      }
      if (ok === false) {
        return {
          ok: false,
          mode: 'unavailable',
          message: 'exportAsFinalCutProXML hat false zurückgegeben',
        }
      }
      const xml = await readUtf8File(file)
      if (!xml || xml.length < 40) {
        return { ok: false, mode: 'unavailable', message: 'Export-XML leer' }
      }
      return { ok: true, mode: 'host_export', xml, path, sequenceName: sequence.name || null }
    }

    // Fallback: operator picks an XML file
    return pickXmlFileFallback()
  } catch (error) {
    console.warn('[VIDEON] captureActiveSequenceXml failed', error)
    return pickXmlFileFallback(error instanceof Error ? error.message : String(error))
  }
}

async function pickXmlFileFallback(reason) {
  try {
    const uxp = await loadNativeModule('uxp')
    const fs = uxp.storage?.localFileSystem
    if (typeof fs?.getFileForOpening !== 'function') {
      return {
        ok: false,
        mode: 'unsupported',
        message:
          (reason ? `${reason}. ` : '') +
          'Sequenz-Export API fehlt (Premiere ≥ 26.2) und kein Datei-Dialog.',
      }
    }
    const file = await fs.getFileForOpening({
      types: ['xml'],
      allowMultiple: false,
    })
    if (!file) {
      return { ok: false, mode: 'unsupported', message: 'Kein XML gewählt.' }
    }
    const xml = await readUtf8File(file)
    if (!xml) return { ok: false, mode: 'unsupported', message: 'XML leer.' }
    return {
      ok: true,
      mode: 'file_pick',
      xml,
      path: file.nativePath || null,
      message: reason ? `Host-Export fehlgeschlagen (${reason}) — Datei verwendet.` : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      mode: 'unsupported',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
