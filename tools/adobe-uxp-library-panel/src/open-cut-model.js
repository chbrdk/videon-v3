/**
 * Pure Open Cut helpers — specs/domain/adobe-uxp-open-cut-premiere.md Wave B.
 */

export const OPEN_CUT_PHASE = {
  export: 'export',
  download: 'download',
  extract: 'extract',
  handoff: 'handoff',
  import: 'import',
  done: 'done',
  error: 'error',
}

/** Locked DE labels for QA (spec § B.4). */
export const OPEN_CUT_PHASE_LABEL = {
  export: 'Export…',
  download: 'Download…',
  extract: 'Entpacken…',
  handoff: 'Bereit zum Import…',
  import: 'Import…',
  done: 'Fertig',
  error: 'Fehler',
}

export const OPEN_CUT_LIST_LIMIT = 40
export const OPEN_CUT_MAX_TREES = 8
export const OPEN_CUT_MAX_BYTES = 4 * 1024 * 1024 * 1024
export const OPEN_CUT_POLL_TIMEOUT_MS = 10 * 60 * 1000

export const OPEN_CUT_HANDOFF_BANNER =
  'ZIP entpackt. In Premiere: Datei → Importieren → XML wählen.'

const PRESET_BY_WH = {
  '1920x1080': '16:9',
  '1080x1920': '9:16',
  '1080x1080': '1:1',
}

export function canvasLabel(cut) {
  const w = cut?.width
  const h = cut?.height
  if (w == null || h == null || !Number.isFinite(w) || !Number.isFinite(h)) return '—'
  const key = `${Math.round(w)}x${Math.round(h)}`
  return PRESET_BY_WH[key] || `${Math.round(w)}×${Math.round(h)}`
}

export function formatUpdatedAt(iso, now = Date.now()) {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  const delta = Math.max(0, now - t)
  const min = Math.floor(delta / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const hrs = Math.floor(min / 60)
  if (hrs < 48) return `vor ${hrs} Std.`
  const days = Math.floor(hrs / 24)
  return `vor ${days} T.`
}

/**
 * Spec Wave B: reuse when succeeded premiere_xml and export.createdAt >= cut.updatedAt.
 */
export function shouldReusePremiereExport(cut, exportJob) {
  if (!cut || !exportJob) return false
  if (exportJob.format !== 'premiere_xml') return false
  if (exportJob.status !== 'succeeded') return false
  // Orphan DB rows without a stored package must not be reused (S3 NoSuchKey).
  if (!exportJob.storageKey) return false
  const cutAt = Date.parse(cut.updatedAt || '')
  const expAt = Date.parse(exportJob.createdAt || '')
  if (!Number.isFinite(cutAt) || !Number.isFinite(expAt)) return false
  return expAt >= cutAt
}

export function isMissingStorageKeyError(message) {
  return /specified key does not exist|NoSuchKey|NotFound|missing in (object )?storage|Export package missing/i.test(
    String(message || ''),
  )
}

export function pickReusablePremiereExport(cut, exportsList) {
  const list = Array.isArray(exportsList) ? exportsList : []
  for (const job of list) {
    if (shouldReusePremiereExport(cut, job)) return job
  }
  return null
}

export function openCutIdempotencyKey(cut) {
  const updated = cut?.updatedAt || 'unknown'
  return `open-cut:${cut?.id || 'x'}:${updated}`
}

export function openCutCacheKey(cutId, exportId, bytesOrChecksum) {
  const stamp = bytesOrChecksum != null ? String(bytesOrChecksum) : 'na'
  return `${cutId}:premiere_xml:${exportId}:${stamp}`
}

export function sanitizeOpenCutFolder(cacheKey) {
  return String(cacheKey || 'cut')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120)
}

export function sanitizeCutFileBase(name) {
  const base = String(name || 'cut')
    .replace(/[^\w.\-()+ ]+/g, '_')
    .trim()
    .slice(0, 80)
  return base || 'cut'
}

export function normalizeCutsList(payload) {
  const raw = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : []
  const items = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!id) continue
    items.push({
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id,
      width: typeof row.width === 'number' ? row.width : null,
      height: typeof row.height === 'number' ? row.height : null,
      frameRate: typeof row.frameRate === 'number' ? row.frameRate : null,
      status: typeof row.status === 'string' ? row.status : 'active',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      sceneCount: typeof row.sceneCount === 'number' ? row.sceneCount : null,
    })
  }
  items.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
  return items.slice(0, OPEN_CUT_LIST_LIMIT)
}

export function phaseLabel(phaseId, extra = '') {
  const base = OPEN_CUT_PHASE_LABEL[phaseId] || phaseId
  if (phaseId === 'done' && extra) return `${base} · ${extra}`
  if (phaseId === 'error' && extra) return `${base} · ${extra}`
  return base
}

export function nextPollDelayMs(attempt) {
  const n = Math.max(0, Number(attempt) || 0)
  return Math.min(5000, Math.round(1000 * Math.pow(1.5, n)))
}

/**
 * Find .xml entry among unzipped relative paths (prefer root-level).
 * @param {string[]} paths
 */
export function pickXmlPathFromEntries(paths) {
  const list = (paths || []).map(String)
  const root = list.filter((p) => /\.xml$/i.test(p) && !p.includes('/'))
  if (root.length) return root[0]
  const any = list.find((p) => /\.xml$/i.test(p))
  return any || null
}
