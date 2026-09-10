/**
 * Open Cut orchestrator — Wave B pipeline.
 * Spec: adobe-uxp-open-cut-premiere.md
 */

import {
  downloadExportZip,
  enqueuePremiereExport,
  getCutExport,
  listCutExports,
} from './cuts-api.js'
import { extractOpenCutZip } from './open-cut-cache.js'
import {
  OPEN_CUT_PHASE,
  OPEN_CUT_POLL_TIMEOUT_MS,
  nextPollDelayMs,
  openCutCacheKey,
  openCutIdempotencyKey,
  phaseLabel,
  pickReusablePremiereExport,
} from './open-cut-model.js'
import { openCutInPremiere } from './premiere-open-cut.js'
import { isAfterEffectsHost } from './host.js'

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

async function ensurePremiereExport(settings, cut, platformProjectId, signal, onPhase) {
  onPhase?.(OPEN_CUT_PHASE.export)
  const existing = await listCutExports(settings, cut.id, platformProjectId, signal)
  const reusable = pickReusablePremiereExport(cut, existing)
  if (reusable) return reusable

  const enqueued = await enqueuePremiereExport(
    settings,
    cut.id,
    platformProjectId,
    openCutIdempotencyKey(cut),
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
    let exportJob = await ensurePremiereExport(settings, cut, platformProjectId, signal, emit)
    let downloadUrl = exportJob._downloadUrl

    if (!downloadUrl) {
      emit(OPEN_CUT_PHASE.export)
      const detail = await getCutExport(settings, cut.id, exportJob.id, platformProjectId, signal)
      exportJob = detail?.export || exportJob
      downloadUrl = detail?.downloadUrl
      if (exportJob.status !== 'succeeded') {
        // Still polling if we reused a queued job somehow
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
    const opened = await openCutInPremiere({
      xmlPath: extracted.xmlNativePath,
      extractDir: extracted.extractDir,
      cutId: cut.id,
      exportId: exportJob.id,
      hostInfo,
      binName: settings.binName || 'VIDEON',
      cutName: cut.name,
    })

    if (!opened.ok) {
      emit(OPEN_CUT_PHASE.error, opened.message || 'import')
      return opened
    }

    // If auto_import failed soft into reveal, phase label still reflects mode.
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
    emit(OPEN_CUT_PHASE.error, msg.slice(0, 80))
    return { ok: false, mode: 'error', message: msg }
  }
}
