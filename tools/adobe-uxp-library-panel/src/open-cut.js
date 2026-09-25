/**
 * Open Cut orchestrator — Wave B pipeline.
 * Spec: adobe-uxp-open-cut-premiere.md
 * Strategy: knowledge/adobe-uxp-provider-first.md
 */

import {
  downloadExportZip,
  enqueuePremiereExport,
  getCutDetail,
  getCutExport,
  listCutExports,
} from './cuts-api.js'
import { extractOpenCutZip } from './open-cut-cache.js'
import {
  OPEN_CUT_PHASE,
  OPEN_CUT_POLL_TIMEOUT_MS,
  isMissingStorageKeyError,
  nextPollDelayMs,
  openCutCacheKey,
  openCutIdempotencyKey,
  phaseLabel,
  pickReusablePremiereExport,
} from './open-cut-model.js'
import { openCutInPremiere } from './premiere-open-cut.js'
import { patchLinkedSequenceFromCut, stampSceneIdsOnLinkedSequence } from './premiere-patch-cut.js'
import { normalizeCutDetailScenes } from './xmeml-pushback.js'
import { isAfterEffectsHost } from './host.js'
import { ENABLE_INPLACE_PATCH } from './panel-features.js'

export { ENABLE_CUTS_TAB, ENABLE_INPLACE_PATCH } from './panel-features.js'

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const t = setTimeout(resolve, ms)
    if (signal) {
      const prev = signal.onabort
      signal.onabort = (event) => {
        try {
          if (typeof prev === 'function') prev.call(signal, event)
        } catch {
          /* ignore */
        }
        clearTimeout(t)
        reject(new Error('aborted'))
      }
    }
  })
}

async function ensurePremiereExport(settings, cut, platformProjectId, signal, onPhase, forceFresh) {
  onPhase?.(OPEN_CUT_PHASE.export)
  if (!forceFresh) {
    const existing = await listCutExports(settings, cut.id, platformProjectId, signal)
    const reusable = pickReusablePremiereExport(cut, existing)
    if (reusable) return reusable
  }

  const enqueued = await enqueuePremiereExport(
    settings,
    cut.id,
    platformProjectId,
    forceFresh
      ? `${openCutIdempotencyKey(cut)}:force:${Date.now()}`
      : openCutIdempotencyKey(cut),
    signal,
  )

  const started = Date.now()
  let attempt = 0
  let current = enqueued

  while (current.status !== 'succeeded') {
    if (signal?.aborted) throw new Error('aborted')
    if (current.status === 'failed' || current.status === 'cancelled') {
      throw new Error(current.errorMessage || `Export ${current.status}`)
    }
    if (Date.now() - started > OPEN_CUT_POLL_TIMEOUT_MS) {
      throw new Error('Export Timeout (10 Min.)')
    }
    await sleep(nextPollDelayMs(attempt), signal)
    attempt += 1
    const detail = await getCutExport(settings, cut.id, current.id, platformProjectId, signal)
    current = detail?.export || current
    if (detail?.export?.status === 'succeeded' && detail.downloadUrl) {
      return { ...detail.export, _downloadUrl: detail.downloadUrl }
    }
  }

  const finalDetail = await getCutExport(settings, cut.id, current.id, platformProjectId, signal)
  return {
    ...(finalDetail?.export || current),
    _downloadUrl: finalDetail?.downloadUrl || null,
  }
}

/**
 * @param {{
 *   settings: object,
 *   cut: object,
 *   platformProjectId: string,
 *   hostInfo: object,
 *   signal?: AbortSignal,
 *   handoff?: boolean,
 *   forceFreshExport?: boolean,
 *   replaceLinked?: boolean,
 *   forceZipReplace?: boolean,
 *   link?: object|null,
 *   onPhase?: (phase: string, label: string) => void,
 * }} input
 */
export async function runOpenCut(input) {
  const {
    settings,
    cut,
    platformProjectId,
    hostInfo,
    signal,
    handoff = true,
    forceFreshExport = false,
    replaceLinked = false,
    forceZipReplace = false,
    link = null,
    onPhase,
  } = input

  const emit = (phase, extra) => {
    onPhase?.(phase, phaseLabel(phase, extra))
  }

  if (isAfterEffectsHost(hostInfo) || hostInfo?.id === 'AEFT') {
    emit(OPEN_CUT_PHASE.error, 'nur Premiere')
    return {
      ok: false,
      mode: 'unsupported',
      message: 'Open Cut ist nur in Premiere Pro verfügbar.',
    }
  }

  if (!platformProjectId) {
    emit(OPEN_CUT_PHASE.error, 'Collection fehlt')
    return { ok: false, mode: 'unsupported', message: 'Collection pinnen, dann Cuts öffnen.' }
  }
  if (!cut?.id) {
    emit(OPEN_CUT_PHASE.error, 'Cut fehlt')
    return { ok: false, mode: 'unsupported', message: 'Kein Cut gewählt.' }
  }

  try {
    // Wave P4 in-place patch paused (ENABLE_INPLACE_PATCH). Provider-first: ZIP replace only.
    if (ENABLE_INPLACE_PATCH && handoff && replaceLinked && !forceZipReplace) {
      emit(OPEN_CUT_PHASE.import, 'Patch…')
      try {
        const detail = await getCutDetail(settings, cut.id, platformProjectId, signal)
        const scenes = normalizeCutDetailScenes(detail)
        const patched = await patchLinkedSequenceFromCut({
          cut: { ...cut, name: cut.name || detail?.name },
          scenes,
          link: link || { sequenceName: cut.name },
        })
        if (patched.ok) {
          emit(OPEN_CUT_PHASE.done, patched.mode)
          return {
            ok: true,
            mode: patched.mode,
            cutId: cut.id,
            sequenceName: link?.sequenceName || cut.name,
            sequenceGuid: link?.sequenceGuid || null,
            exportId: link?.exportId || null,
            patched: patched.patched,
            matchMode: patched.matchMode,
            message: patched.message,
          }
        }
        emit(OPEN_CUT_PHASE.error, 'Patch nein')
        return {
          ok: false,
          mode: 'patch_rejected',
          cutId: cut.id,
          message:
            `In-Place-Patch fehlgeschlagen: ${patched.message || 'unbekannt'}. ` +
            `Sequenz nicht ersetzt — Live-Effekte bleiben. ` +
            `Nur wenn nötig: „Cut neu laden“ (zerstört Live-Effekte).`,
          patchMessage: patched.message,
        }
      } catch (patchError) {
        const patchMsg = patchError instanceof Error ? patchError.message : String(patchError)
        emit(OPEN_CUT_PHASE.error, 'Patch Fehler')
        return {
          ok: false,
          mode: 'patch_rejected',
          cutId: cut.id,
          message:
            `In-Place-Patch Fehler: ${patchMsg}. Sequenz nicht ersetzt — Live-Effekte bleiben. ` +
            `Nur wenn nötig: „Cut neu laden“.`,
        }
      }
    }

    const resolvePackage = async (forceFresh) => {
      let exportJob = await ensurePremiereExport(
        settings,
        cut,
        platformProjectId,
        signal,
        emit,
        forceFresh,
      )
      let downloadUrl = exportJob._downloadUrl

      if (!downloadUrl) {
        emit(OPEN_CUT_PHASE.export)
        const detail = await getCutExport(settings, cut.id, exportJob.id, platformProjectId, signal)
        exportJob = detail?.export || exportJob
        downloadUrl = detail?.downloadUrl
        if (exportJob.status !== 'succeeded') {
          const started = Date.now()
          let attempt = 0
          while (exportJob.status !== 'succeeded') {
            if (exportJob.status === 'failed' || exportJob.status === 'cancelled') {
              throw new Error(exportJob.errorMessage || `Export ${exportJob.status}`)
            }
            if (Date.now() - started > OPEN_CUT_POLL_TIMEOUT_MS) throw new Error('Export Timeout')
            await sleep(nextPollDelayMs(attempt), signal)
            attempt += 1
            const again = await getCutExport(settings, cut.id, exportJob.id, platformProjectId, signal)
            exportJob = again?.export || exportJob
            downloadUrl = again?.downloadUrl
          }
        }
      }

      if (!downloadUrl) throw new Error('downloadUrl nach Export fehlt')

      emit(OPEN_CUT_PHASE.download)
      const zipBuffer = await downloadExportZip(downloadUrl, signal)
      return { exportJob, zipBuffer }
    }

    let packageResult
    try {
      packageResult = await resolvePackage(forceFreshExport)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (!forceFreshExport && isMissingStorageKeyError(msg)) {
        emit(OPEN_CUT_PHASE.export, 'Export neu…')
        packageResult = await resolvePackage(true)
      } else {
        throw error
      }
    }

    const { exportJob, zipBuffer } = packageResult
    const cacheKey = openCutCacheKey(cut.id, exportJob.id, exportJob.bytes ?? zipBuffer.byteLength)

    emit(OPEN_CUT_PHASE.extract)
    const extracted = await extractOpenCutZip(cacheKey, zipBuffer)

    if (!handoff) {
      emit(OPEN_CUT_PHASE.done, 'ZIP bereit')
      return {
        ok: true,
        mode: 'cache_only',
        cutId: cut.id,
        exportId: exportJob.id,
        xmlPath: extracted.xmlNativePath,
        extractDir: extracted.extractDir,
        message: `ZIP bereit:\n${extracted.xmlNativePath}`,
      }
    }

    emit(OPEN_CUT_PHASE.import)
    let opened = await openCutInPremiere({
      xmlPath: extracted.xmlNativePath,
      extractDir: extracted.extractDir,
      cutId: cut.id,
      exportId: exportJob.id,
      hostInfo,
      binName: settings.binName || 'VIDEON',
      cutName: cut.name,
      replaceLinked,
      link,
    })

    if (!opened.ok) {
      emit(OPEN_CUT_PHASE.error, opened.message || 'import')
      return opened
    }

    // After ZIP import, stamp scene ids onto live track items (Premiere often drops XML name marks).
    if (opened.mode === 'auto_import' || opened.mode === 'reveal_and_prompt') {
      try {
        const detail = await getCutDetail(settings, cut.id, platformProjectId, signal)
        const scenes = normalizeCutDetailScenes(detail)
        const stamped = await stampSceneIdsOnLinkedSequence({
          cut: { ...cut, name: cut.name || detail?.name },
          scenes,
          link: {
            sequenceName: opened.sequenceName || cut.name,
            sequenceGuid: opened.sequenceGuid || null,
          },
        })
        if (stamped.ok) {
          opened = {
            ...opened,
            message: `${opened.message || 'Import OK'} · ${stamped.message}`,
            stamped: stamped.stamped,
          }
        }
      } catch {
        /* stamp is best-effort */
      }
    }

    if (opened.mode === 'reveal_and_prompt') {
      emit(OPEN_CUT_PHASE.handoff)
    }
    emit(OPEN_CUT_PHASE.done, opened.mode)
    return {
      ...opened,
      message: opened.message,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg === 'aborted') {
      emit(OPEN_CUT_PHASE.error, 'abgebrochen')
      return { ok: false, mode: 'unsupported', message: 'Abgebrochen.' }
    }
    const friendly = isMissingStorageKeyError(msg)
      ? `Export/Medien fehlen im Storage (${msg.slice(0, 120)}). Cut-Medien prüfen oder neu hochladen.`
      : msg
    emit(OPEN_CUT_PHASE.error, friendly.slice(0, 80))
    return { ok: false, mode: 'error', message: friendly }
  }
}
