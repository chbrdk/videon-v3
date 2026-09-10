import { insertHitIntoAfterEffects } from './aftereffects.js'
import {
  absoluteProductHref,
  fetchFrameBlob,
  fetchPreviewBlob,
  listCollections,
  loadLastQuery,
  loadSettings,
  requestAdobeDownload,
  saveLastQuery,
  saveSettings,
  searchMedia,
  testHealth,
  verifyApiToken,
} from './api.js'
import { loadNativeModule } from './native.js'
import {
  clearCache,
  formatCacheBytes,
  getCacheStats,
  materializeDownload,
  materializePoster,
  materializePreview,
  posterCacheKey,
  previewCacheKey,
  readCachedPosterBlob,
  readCachedPreviewBlob,
  refreshCacheStats,
} from './cache.js'
import { clearOpenCutCache } from './open-cut-cache.js'
import { listCuts } from './cuts-api.js'
import { runOpenCut } from './open-cut.js'
import { applyCutPushback, previewCutPushback } from './cut-pushback.js'
import { getCutSequenceLink, saveCutSequenceLink } from './cut-link-store.js'
import {
  canvasLabel,
  formatUpdatedAt,
} from './open-cut-model.js'
import { normalizeCollections } from './collections.js'
import {
  dedupeSearchHits,
  formatRank,
  normalizeSearchHit,
  sceneHitDurationLabel,
  sceneHitTimingLabel,
} from './hit-model.js'
import { detectHostApp, isAfterEffectsHost } from './host.js'
import { insertHitIntoPremiere } from './premiere.js'
import { looksLikeApiToken, normalizeProductBaseUrl } from './settings.js'

/** Keep in sync with manifest.json / package.json — shown in panel chrome. */
const PANEL_VERSION = '0.1.26'

/** Max concurrent MP4 preview fetches (Product route ≤3s each). */
const PREVIEW_CONCURRENCY = 2

/** @type {Record<string, HTMLElement | null>} */
let els = {}

function queryEls() {
  return {
    panelVersion: document.getElementById('panel-version'),
    settingsToggle: document.getElementById('settings-toggle'),
    settingsPanel: document.getElementById('settings-panel'),
    productBaseUrl: document.getElementById('product-base-url'),
    apiToken: document.getElementById('api-token'),
    collectionSelect: document.getElementById('collection-select'),
    collectionSelectMain: document.getElementById('collection-select-main'),
    defaultProjectId: document.getElementById('default-project-id'),
    binName: document.getElementById('bin-name'),
    compName: document.getElementById('comp-name'),
    premiereBinLabel: document.getElementById('premiere-bin-label'),
    aeCompLabel: document.getElementById('ae-comp-label'),
    settingsSave: document.getElementById('settings-save'),
    testConnection: document.getElementById('test-connection'),
    reloadCollections: document.getElementById('reload-collections'),
    cacheStats: document.getElementById('cache-stats'),
    cacheRefresh: document.getElementById('cache-refresh'),
    cacheClear: document.getElementById('cache-clear'),
    settingsStatus: document.getElementById('settings-status'),
    bootStatus: document.getElementById('boot-status'),
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    banner: document.getElementById('banner'),
    resultsList: document.getElementById('results-list'),
    resultsCount: document.getElementById('results-count'),
    selectAllBtn: document.getElementById('select-all-btn'),
    selectNoneBtn: document.getElementById('select-none-btn'),
    insertBar: document.getElementById('insert-bar'),
    hostBadge: document.getElementById('host-badge'),
    premiereInsertOpts: document.getElementById('premiere-insert-opts'),
    aeInsertOpts: document.getElementById('ae-insert-opts'),
    appendSequence: document.getElementById('append-sequence'),
    aeSequential: document.getElementById('ae-sequential'),
    aeGapFrames: document.getElementById('ae-gap-frames'),
    dryRunBtn: document.getElementById('dry-run-btn'),
    insertBtn: document.getElementById('insert-btn'),
    selectedCount: document.getElementById('selected-count'),
    progress: document.getElementById('progress'),
    progressBar: document.getElementById('progress-bar'),
    modeScenesBtn: document.getElementById('mode-scenes-btn'),
    modeCutsBtn: document.getElementById('mode-cuts-btn'),
    scenesMode: document.getElementById('scenes-mode'),
    cutsMode: document.getElementById('cuts-mode'),
    cutsBanner: document.getElementById('cuts-banner'),
    cutsList: document.getElementById('cuts-list'),
    cutsCount: document.getElementById('cuts-count'),
    cutsRefreshBtn: document.getElementById('cuts-refresh-btn'),
    pushbackConfirm: document.getElementById('pushback-confirm'),
    pushbackDiff: document.getElementById('pushback-diff'),
    pushbackApplyBtn: document.getElementById('pushback-apply-btn'),
    pushbackRefreshBtn: document.getElementById('pushback-refresh-btn'),
    pushbackCancelBtn: document.getElementById('pushback-cancel-btn'),
  }
}

const REQUIRED_EL_IDS = [
  'settings-toggle',
  'settings-panel',
  'settings-save',
  'test-connection',
  'settings-status',
  'product-base-url',
  'api-token',
  'search-input',
  'search-btn',
]

function missingRequiredEls() {
  return REQUIRED_EL_IDS.filter((id) => !document.getElementById(id))
}

/** @type {ReturnType<typeof normalizeSearchHit>[]} */
let hits = []
/** @type {Set<string>} */
const selected = new Set()
/** @type {string[]} */
const blobUrls = []
/** @type {{ id: string, name: string, status: string }[]} */
let collections = []
/** @type {AbortController | null} */
let searchAbort = null
/** @type {AbortController | null} */
let cutsAbort = null
/** @type {AbortController | null} */
let openCutAbort = null
/** @type {'scenes' | 'cuts'} */
let panelMode = 'scenes'
/** @type {ReturnType<typeof listCuts> extends Promise<infer T> ? T : never} */
let cuts = []
/** @type {boolean} */
let openCutBusy = false
/** @type {null | object} */
let pendingPushback = null
/** @type {{ id: 'PPRO' | 'AEFT', source: string }} */
let hostInfo = { id: 'PPRO', source: 'default' }
/** @type {number} */
let aeCursorSec = 0

function showBanner(message, tone = '') {
  const target = panelMode === 'cuts' ? els.cutsBanner : els.banner
  if (!target) return
  target.hidden = !message
  target.textContent = message || ''
  target.className = `banner${tone ? ` ${tone}` : ''}`
}

function setPanelMode(mode) {
  panelMode = mode === 'cuts' ? 'cuts' : 'scenes'
  els.modeScenesBtn?.classList.toggle('is-active', panelMode === 'scenes')
  els.modeCutsBtn?.classList.toggle('is-active', panelMode === 'cuts')
  els.scenesMode?.classList.toggle('hidden', panelMode !== 'scenes')
  els.cutsMode?.classList.toggle('hidden', panelMode !== 'cuts')

  if (panelMode === 'cuts') {
    searchAbort?.abort()
    openCutAbort?.abort()
    openCutBusy = false
    void refreshCutsList()
  } else {
    cutsAbort?.abort()
    openCutAbort?.abort()
    openCutBusy = false
    hidePushbackConfirm()
  }
}

function applyHostChrome() {
  const ae = isAfterEffectsHost(hostInfo)
  els.premiereBinLabel?.classList.toggle('hidden', ae)
  els.aeCompLabel?.classList.toggle('hidden', !ae)
  els.premiereInsertOpts?.classList.toggle('hidden', ae)
  els.aeInsertOpts?.classList.toggle('hidden', !ae)
  if (els.hostBadge) {
    els.hostBadge.hidden = false
    els.hostBadge.textContent = ae
      ? `Host: After Effects (${hostInfo.source})`
      : `Host: Premiere Pro (${hostInfo.source})`
  }
}

function updateCacheStatsLabel(stats) {
  if (!els.cacheStats) return
  const s = stats || getCacheStats()
  els.cacheStats.textContent = `${s.count} Datei(en) · ${formatCacheBytes(s.bytes)}`
}

async function refreshCacheUi(showStatus = false) {
  try {
    const stats = await refreshCacheStats()
    updateCacheStatsLabel(stats)
    if (showStatus) {
      els.settingsStatus.hidden = false
      els.settingsStatus.textContent = `Cache: ${stats.count} · ${formatCacheBytes(stats.bytes)}`
    }
  } catch (error) {
    updateCacheStatsLabel(getCacheStats())
    if (showStatus) {
      els.settingsStatus.hidden = false
      els.settingsStatus.textContent = error instanceof Error ? error.message : String(error)
    }
  }
}

async function loadPosterForHit(settings, hit, signal) {
  const key = posterCacheKey(hit)
  try {
    const cached = await readCachedPosterBlob(key)
    if (cached) return cached
  } catch {
    /* network */
  }
  const blob = await fetchFrameBlob(settings, hit, signal)
  if (!blob) return null
  void materializePoster({ cacheKey: key, blob, filename: 'poster.jpg' })
  return blob
}

function revokeBlobs() {
  while (blobUrls.length) {
    const url = blobUrls.pop()
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
  }
}

async function openExternal(href) {
  try {
    const uxp = await loadNativeModule('uxp')
    if (uxp?.shell?.openExternal) {
      await uxp.shell.openExternal(href)
      return
    }
  } catch {
    /* fall through */
  }
  try {
    window.open(href, '_blank')
  } catch {
    showBanner(href, 'ok')
  }
}

function fillCollectionSelect(select, selectedId) {
  if (!select) return
  const current = selectedId || ''
  select.innerHTML = ''
  const all = document.createElement('option')
  all.value = ''
  all.textContent = '— alle zugänglichen —'
  select.append(all)
  for (const item of collections) {
    const opt = document.createElement('option')
    opt.value = item.id
    opt.textContent = item.status && item.status !== 'active' ? `${item.name} (${item.status})` : item.name
    select.append(opt)
  }
  select.value = collections.some((c) => c.id === current) ? current : ''
}

function syncCollectionUi(selectedId) {
  fillCollectionSelect(els.collectionSelect, selectedId)
  fillCollectionSelect(els.collectionSelectMain, selectedId)
  if (els.defaultProjectId) els.defaultProjectId.value = selectedId || ''
}

function applySettingsToForm(settings) {
  els.productBaseUrl.value = settings.productBaseUrl || ''
  els.apiToken.value = settings.apiToken || ''
  if (els.binName) els.binName.value = settings.binName || 'VIDEON'
  if (els.compName) els.compName.value = settings.compName || 'VIDEON'
  if (els.aeSequential) els.aeSequential.checked = settings.aeSequential !== false
  if (els.aeGapFrames) els.aeGapFrames.value = String(settings.aeGapFrames ?? 0)
  syncCollectionUi(settings.defaultPlatformProjectId || '')
}

function readFormSettings() {
  const fromSelect =
    els.collectionSelectMain?.value?.trim() ||
    els.collectionSelect?.value?.trim() ||
    els.defaultProjectId.value.trim()
  return {
    productBaseUrl: els.productBaseUrl.value.trim(),
    apiToken: els.apiToken.value.trim(),
    defaultPlatformProjectId: fromSelect,
    binName: els.binName?.value.trim() || 'VIDEON',
    compName: els.compName?.value.trim() || 'VIDEON',
    aeSequential: els.aeSequential ? els.aeSequential.checked : true,
    aeGapFrames: els.aeGapFrames ? Math.max(0, Number(els.aeGapFrames.value) || 0) : 0,
  }
}

function onCollectionChange(event) {
  const id = event.target.value
  if (els.collectionSelect) els.collectionSelect.value = id
  if (els.collectionSelectMain) els.collectionSelectMain.value = id
  if (els.defaultProjectId) els.defaultProjectId.value = id
  saveSettings({ defaultPlatformProjectId: id })
  if (panelMode === 'cuts') void refreshCutsList()
}

function showCutsBanner(message, tone = '') {
  if (!els.cutsBanner) return
  els.cutsBanner.hidden = !message
  els.cutsBanner.textContent = message || ''
  els.cutsBanner.className = `banner${tone ? ` ${tone}` : ''}`
}

function updateCutRowStatus(cutId, text, isError = false) {
  let card = null
  for (const node of els.cutsList?.querySelectorAll('.cut-card') || []) {
    if (node.getAttribute('data-cut-id') === cutId) {
      card = node
      break
    }
  }
  if (!card) return
  let status = card.querySelector('.cut-card-status')
  if (!status) {
    status = document.createElement('div')
    status.className = 'cut-card-status'
    card.append(status)
  }
  status.textContent = text || ''
  status.classList.toggle('is-error', Boolean(isError))
  status.hidden = !text
  card.classList.toggle('is-busy', Boolean(text) && !isError && openCutBusy)
}

function buildCutCard(cut) {
  const card = document.createElement('article')
  card.className = 'cut-card'
  card.setAttribute('data-cut-id', cut.id)

  const title = document.createElement('div')
  title.className = 'cut-card-title'
  title.textContent = cut.name

  const meta = document.createElement('div')
  meta.className = 'cut-card-meta'
  const parts = [canvasLabel(cut)]
  if (cut.sceneCount != null) parts.push(`${cut.sceneCount} Szenen`)
  parts.push(formatUpdatedAt(cut.updatedAt))
  meta.textContent = parts.join(' · ')

  const actions = document.createElement('div')
  actions.className = 'cut-card-actions'

  const openBtn = document.createElement('button')
  openBtn.type = 'button'
  openBtn.className = 'primary'
  openBtn.textContent = 'In Premiere öffnen'
  on(openBtn, 'click', (event) => {
    event.stopPropagation?.()
    void startOpenCut(cut, { handoff: true, replaceLinked: false, forceFreshExport: false })
  })

  const refreshBtn = document.createElement('button')
  refreshBtn.type = 'button'
  refreshBtn.className = 'ghost'
  refreshBtn.textContent = 'Premiere aktualisieren'
  on(refreshBtn, 'click', (event) => {
    event.stopPropagation?.()
    void startOpenCut(cut, { handoff: true, replaceLinked: true, forceFreshExport: true })
  })

  const cacheBtn = document.createElement('button')
  cacheBtn.type = 'button'
  cacheBtn.className = 'ghost'
  cacheBtn.textContent = 'ZIP cachen'
  on(cacheBtn, 'click', (event) => {
    event.stopPropagation?.()
    void startOpenCut(cut, { handoff: false, replaceLinked: false, forceFreshExport: false })
  })

  const pushBtn = document.createElement('button')
  pushBtn.type = 'button'
  pushBtn.className = 'ghost'
  pushBtn.textContent = 'Cut aktualisieren'
  on(pushBtn, 'click', (event) => {
    event.stopPropagation?.()
    void startCutPushback(cut)
  })

  actions.append(openBtn, refreshBtn, pushBtn, cacheBtn)
  card.append(title, meta, actions)
  return card
}

function renderCutsList() {
  if (!els.cutsList) return
  if (els.cutsCount) els.cutsCount.textContent = String(cuts.length)
  if (!cuts.length) {
    els.cutsList.innerHTML = '<p class="empty">Keine Cuts in dieser Collection.</p>'
    return
  }
  els.cutsList.innerHTML = ''
  for (const cut of cuts) els.cutsList.append(buildCutCard(cut))
}

async function refreshCutsList() {
  const settings = saveSettings(readFormSettings())
  const platformProjectId = settings.defaultPlatformProjectId || ''
  if (!platformProjectId) {
    cuts = []
    if (els.cutsCount) els.cutsCount.textContent = '0'
    if (els.cutsList) {
      els.cutsList.innerHTML =
        '<p class="empty">Collection pinnen (nicht „alle“), dann Cuts laden.</p>'
    }
    showCutsBanner('Für Cuts eine Collection wählen.', 'error')
    return
  }
  if (!settings.apiToken) {
    showCutsBanner('API Token in den Einstellungen setzen.', 'error')
    return
  }

  cutsAbort?.abort()
  cutsAbort = new AbortController()
  const { signal } = cutsAbort
  showCutsBanner('Cuts laden…')
  try {
    cuts = await listCuts(settings, platformProjectId, signal)
    if (signal.aborted) return
    renderCutsList()
    showCutsBanner(cuts.length ? `${cuts.length} Cut(s)` : 'Keine Cuts.', cuts.length ? 'ok' : '')
  } catch (error) {
    if (signal.aborted) return
    const msg = error instanceof Error ? error.message : String(error)
    showCutsBanner(msg, 'error')
  }
}

async function startOpenCut(cut, options = {}) {
  const handoff = options.handoff !== false
  const replaceLinked = Boolean(options.replaceLinked)
  const forceFreshExport = Boolean(options.forceFreshExport)
  if (openCutBusy) {
    showCutsBanner('Bitte warten — Open Cut läuft bereits.', 'error')
    return
  }
  const settings = saveSettings(readFormSettings())
  const platformProjectId = settings.defaultPlatformProjectId || ''
  if (!platformProjectId) {
    showCutsBanner('Collection pinnen.', 'error')
    return
  }
  if (isAfterEffectsHost(hostInfo)) {
    showCutsBanner('Open Cut ist nur in Premiere Pro verfügbar.', 'error')
    return
  }

  openCutBusy = true
  openCutAbort?.abort()
  openCutAbort = new AbortController()
  const { signal } = openCutAbort
  const link = getCutSequenceLink(platformProjectId, cut.id)

  const result = await runOpenCut({
    settings,
    cut,
    platformProjectId,
    hostInfo,
    signal,
    handoff,
    forceFreshExport,
    replaceLinked: replaceLinked && Boolean(link || cut.name),
    link: link || { sequenceName: cut.name },
    onPhase: (_phase, label) => {
      updateCutRowStatus(cut.id, label, false)
      showCutsBanner(`${cut.name}: ${label}`)
    },
  })

  openCutBusy = false
  if (result.ok) {
    if (handoff && platformProjectId) {
      saveCutSequenceLink({
        cutId: cut.id,
        platformProjectId,
        sequenceName: result.sequenceName || cut.name,
        sequenceGuid: result.sequenceGuid || null,
        exportId: result.exportId || null,
        openedAt: new Date().toISOString(),
      })
    }
    updateCutRowStatus(cut.id, result.message || 'Fertig', false)
    showCutsBanner(result.message || 'Fertig', 'ok')
  } else {
    updateCutRowStatus(cut.id, result.message || 'Fehler', true)
    showCutsBanner(result.message || 'Fehler', 'error')
  }
}

function hidePushbackConfirm() {
  pendingPushback = null
  els.pushbackConfirm?.classList.add('hidden')
  if (els.pushbackDiff) els.pushbackDiff.textContent = ''
}

function showPushbackConfirm(preview) {
  pendingPushback = preview
  if (els.pushbackDiff) els.pushbackDiff.textContent = preview.message || ''
  els.pushbackConfirm?.classList.remove('hidden')
  const ignored = preview.ignored || []
  const effectsRisk = ignored.some((x) => /effect|transition/i.test(String(x)))
  if (effectsRisk) {
    showCutsBanner(
      'Diff enthält Effekte/Transitions — bleiben nur in Premiere bis Wave P3.',
      'error',
    )
  }
}

async function startCutPushback(cut) {
  if (openCutBusy) {
    showCutsBanner('Bitte warten…', 'error')
    return
  }
  const settings = saveSettings(readFormSettings())
  const platformProjectId = settings.defaultPlatformProjectId || ''
  if (!platformProjectId) {
    showCutsBanner('Collection pinnen.', 'error')
    return
  }
  if (isAfterEffectsHost(hostInfo)) {
    showCutsBanner('Cut aktualisieren nur in Premiere.', 'error')
    return
  }

  openCutBusy = true
  hidePushbackConfirm()
  showCutsBanner(`${cut.name}: Sequenz lesen…`)
  updateCutRowStatus(cut.id, 'Pushback…', false)

  try {
    const preview = await previewCutPushback({
      settings,
      cut,
      platformProjectId,
      hostInfo,
    })
    openCutBusy = false
    if (!preview.ok) {
      updateCutRowStatus(cut.id, preview.message || 'Fehler', true)
      showCutsBanner(preview.message || 'Fehler', 'error')
      return
    }
    if (!preview.diff?.changed) {
      updateCutRowStatus(cut.id, 'Bereits gleich', false)
      showCutsBanner('Cut entspricht der Sequenz (V1).', 'ok')
      return
    }
    showPushbackConfirm(preview)
    showCutsBanner('Diff prüfen und übernehmen.', 'ok')
    updateCutRowStatus(cut.id, preview.diff.summary, false)
  } catch (error) {
    openCutBusy = false
    const msg = error instanceof Error ? error.message : String(error)
    updateCutRowStatus(cut.id, msg, true)
    showCutsBanner(msg, 'error')
  }
}

async function confirmPushback(withSequenceReplace) {
  if (!pendingPushback?.restoreScenes?.length) {
    hidePushbackConfirm()
    return
  }
  const preview = pendingPushback
  const settings = saveSettings(readFormSettings())
  openCutBusy = true
  showCutsBanner('Cut wird geschrieben…')
  try {
    const applied = await applyCutPushback({
      settings,
      cutId: preview.cutId,
      platformProjectId: preview.platformProjectId,
      restoreScenes: preview.restoreScenes,
    })
    hidePushbackConfirm()
    if (!applied.ok) {
      openCutBusy = false
      showCutsBanner(applied.message || 'Apply fehlgeschlagen', 'error')
      return
    }

    // Keep Cuts-list updatedAt in sync so a later refresh never reuses a pre-apply ZIP.
    const nowIso = new Date().toISOString()
    const idx = cuts.findIndex((c) => c.id === preview.cutId)
    if (idx >= 0) cuts[idx] = { ...cuts[idx], updatedAt: nowIso }
    const cut = cuts.find((c) => c.id === preview.cutId) || {
      id: preview.cutId,
      name: preview.sequenceName || preview.cutId,
      updatedAt: nowIso,
    }

    // Only replace Premiere when the operator explicitly asked — never auto-download.
    if (withSequenceReplace) {
      showCutsBanner('Cut OK — Sequenz wird ersetzt…', 'ok')
      openCutBusy = false
      await startOpenCut(
        { ...cut, updatedAt: nowIso, name: cut.name || preview.sequenceName || cut.id },
        { handoff: true, replaceLinked: true, forceFreshExport: true },
      )
      const droppedFx = (preview.ignored || []).some((x) => /effect|transition/i.test(String(x)))
      showCutsBanner(
        droppedFx
          ? 'Cut aktualisiert + Sequenz ersetzt (Cut-Modell). Premiere-Effekte/Transitions sind dabei entfernt — Wave P3 folgt.'
          : 'Cut aktualisiert. Sequenz ersetzt — beide Seiten gleich (Cut-Modell).',
        droppedFx ? 'error' : 'ok',
      )
      return
    }

    openCutBusy = false
    updateCutRowStatus(preview.cutId, 'Cut aktualisiert', false)
    const droppedFx = (preview.ignored || []).some((x) => /effect|transition/i.test(String(x)))
    showCutsBanner(
      droppedFx
        ? 'Cut entspricht der Sequenz (V1). Premiere behält Effekte — bis Wave P3 nicht zurücksyncen wenn du sie behalten willst.'
        : 'Cut entspricht der Sequenz. (Premiere bleibt — kein neuer Import.)',
      droppedFx ? 'error' : 'ok',
    )
  } catch (error) {
    openCutBusy = false
    hidePushbackConfirm()
    showCutsBanner(error instanceof Error ? error.message : String(error), 'error')
  }
}

function updateSelectionChrome() {
  els.selectedCount.textContent = String(selected.size)
  els.insertBar.classList.toggle('hidden', selected.size === 0)
  const hasHits = hits.length > 0
  els.selectAllBtn.hidden = !hasHits
  els.selectNoneBtn.hidden = !hasHits
}

function setBusy(busy) {
  els.searchBtn.disabled = busy
  els.dryRunBtn.disabled = busy
  els.insertBtn.disabled = busy
  for (const btn of els.resultsList?.querySelectorAll('.hit-insert-btn') || []) {
    btn.disabled = busy
  }
}

function findHitCard(hitId) {
  if (!els.resultsList) return null
  for (const node of els.resultsList.querySelectorAll('.hit-card') || []) {
    if (node.getAttribute('data-hit-id') === hitId) return node
  }
  return null
}

async function mapPool(items, concurrency, worker) {
  const list = [...items]
  const limit = Math.max(1, concurrency)
  const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (list.length) {
      const item = list.shift()
      if (item === undefined) return
      await worker(item)
    }
  })
  await Promise.all(runners)
}

function authErrorHint(message) {
  const text = String(message || '')
  if (
    /service_unauthorized/i.test(text) ||
    /Authentication required/i.test(text) ||
    /Invalid or missing API token/i.test(text)
  ) {
    return (
      `${text} — Token unbekannt (nach Restart/Deploy neu in VIDEON Settings erzeugen, ` +
      `videon_… hier einfügen). Owner kommt automatisch aus dem Token.`
    )
  }
  return text
}

async function refreshCollections(showStatus = true) {
  const settings = saveSettings(readFormSettings())
  if (!settings.apiToken) {
    if (showStatus) {
      els.settingsStatus.hidden = false
      els.settingsStatus.textContent = 'Token setzen, dann Collections laden.'
    }
    return
  }
  if (!looksLikeApiToken(settings.apiToken)) {
    const msg = 'Token-Format prüfen: videon_ + 64 Hex-Zeichen'
    if (showStatus) {
      els.settingsStatus.hidden = false
      els.settingsStatus.textContent = msg
    }
    showBanner(msg, 'error')
    return
  }
  if (showStatus) {
    els.settingsStatus.hidden = false
    els.settingsStatus.textContent = 'Collections…'
  }
  try {
    const payload = await listCollections(settings)
    collections = normalizeCollections(payload)
    syncCollectionUi(settings.defaultPlatformProjectId)
    if (showStatus) {
      els.settingsStatus.textContent = `${collections.length} Collection(s)`
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    const msg = authErrorHint(raw)
    if (showStatus) {
      els.settingsStatus.textContent = msg
    }
    showBanner(msg, 'error')
  }
}

function buildHitRow(settings, hit, posterUrl) {
  const row = document.createElement('article')
  row.className = `hit-card${selected.has(hit.id) ? ' selected' : ''}`
  row.setAttribute('data-hit-id', hit.id)

  const media = document.createElement('div')
  media.className = 'hit-card-media'

  const img = document.createElement('img')
  img.className = 'hit-card-thumb'
  img.alt = hit.mediaFilename || 'Szene'
  if (posterUrl) {
    img.src = posterUrl
  } else {
    img.classList.add('hit-ph')
  }

  const video = document.createElement('video')
  video.className = 'hit-card-preview'
  video.muted = true
  video.loop = true
  video.autoplay = true
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('muted', '')
  video.setAttribute('loop', '')
  video.setAttribute('autoplay', '')
  video.setAttribute('playsinline', '')
  // Prefer class over hidden — UXP can ignore hidden on media elements.
  video.style.display = 'none'

  const check = document.createElement('input')
  check.type = 'checkbox'
  check.className = 'hit-card-check'
  check.checked = selected.has(hit.id)
  check.title = 'Auswählen'
  on(check, 'click', (event) => {
    event.stopPropagation?.()
  })
  on(check, 'change', () => {
    if (check.checked) selected.add(hit.id)
    else selected.delete(hit.id)
    row.classList.toggle('selected', check.checked)
    updateSelectionChrome()
  })

  const timing = sceneHitTimingLabel(hit)
  const duration = sceneHitDurationLabel(hit)
  if (duration || timing) {
    const badge = document.createElement('span')
    badge.className = 'hit-card-badge'
    badge.textContent = duration ? `Δ ${duration}` : timing
    media.append(badge)
  }

  media.append(img, video, check)

  const body = document.createElement('div')
  body.className = 'hit-card-body'

  const title = document.createElement('div')
  title.className = 'hit-title'
  title.textContent = hit.mediaFilename || 'Clip'
  title.title = hit.mediaFilename || ''

  const meta = document.createElement('div')
  meta.className = 'hit-meta'
  const rank = formatRank(hit.rank)
  meta.textContent = [hit.projectName, timing, hit.sceneKey, rank ? `rank ${rank}` : null]
    .filter(Boolean)
    .join(' · ')

  const snippet = document.createElement('div')
  snippet.className = 'hit-snippet'
  snippet.textContent = hit.searchText || ''
  snippet.title = hit.searchText || ''

  const actions = document.createElement('div')
  actions.className = 'hit-actions'

  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'ghost tiny'
  open.textContent = 'In VIDEON'
  on(open, 'click', (event) => {
    event.stopPropagation?.()
    const href = absoluteProductHref(settings, hit.href)
    if (!href) {
      showBanner('Kein Deep Link am Treffer.', 'error')
      return
    }
    void openExternal(href)
  })

  const insertOne = document.createElement('button')
  insertOne.type = 'button'
  insertOne.className = 'primary tiny hit-insert-btn'
  insertOne.textContent = '+'
  insertOne.title = 'In Premiere / AE einfügen'
  on(insertOne, 'click', (event) => {
    event.stopPropagation?.()
    void runInsert([hit.id])
  })

  actions.append(open, insertOne)

  body.append(title, meta, snippet, actions)
  row.append(media, body)

  on(row, 'click', (event) => {
    const target = event.target
    if (
      target === check ||
      target === open ||
      target === insertOne ||
      (target && open.contains?.(target)) ||
      (target && insertOne.contains?.(target))
    ) {
      return
    }
    check.checked = !check.checked
    if (check.checked) selected.add(hit.id)
    else selected.delete(hit.id)
    row.classList.toggle('selected', check.checked)
    updateSelectionChrome()
  })

  return row
}

function applyPosterToCard(hitId, posterUrl) {
  if (!posterUrl) return
  const card = findHitCard(hitId)
  if (!card) return
  const img = card.querySelector('img.hit-card-thumb')
  if (!img) return
  img.src = posterUrl
  img.classList.remove('hit-ph')
}

function applyPreviewToCard(hitId, previewSrcOrList) {
  const candidates = Array.isArray(previewSrcOrList)
    ? previewSrcOrList.filter(Boolean)
    : previewSrcOrList
      ? [previewSrcOrList]
      : []
  if (!candidates.length) return
  const card = findHitCard(hitId)
  if (!card) return
  const video = card.querySelector('video.hit-card-preview')
  const img = card.querySelector('img.hit-card-thumb')
  if (!video) return

  let attempt = 0
  let settled = false

  const hideVideo = () => {
    video.style.display = 'none'
    video.classList.remove('is-visible')
    if (img) img.classList.remove('hit-thumb-under')
  }

  const startPlayback = () => {
    if (settled) return
    settled = true
    video.style.display = 'block'
    video.classList.add('is-visible')
    if (img) img.classList.add('hit-thumb-under')
    try {
      // UXP play() may resolve even on failure — rely on error event for retries.
      void video.play?.()
    } catch (error) {
      console.warn('[VIDEON] video.play threw', hitId, error)
      settled = false
      tryNext()
    }
  }

  const tryNext = () => {
    if (attempt >= candidates.length) {
      hideVideo()
      console.warn('[VIDEON] video: all src candidates failed', hitId, candidates)
      return
    }
    const src = candidates[attempt]
    attempt += 1
    settled = false
    console.info('[VIDEON] video try src', hitId, src)
    try {
      video.pause?.()
    } catch {
      /* ignore */
    }
    video.src = src
    try {
      video.load?.()
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (!settled && video.readyState >= 2) startPlayback()
    }, 450)
  }

  video.onerror = () => {
    console.warn(
      '[VIDEON] video error',
      hitId,
      video.error?.message || video.error,
      'src=',
      video.src,
    )
    if (settled) {
      hideVideo()
      return
    }
    tryNext()
  }
  video.onloadeddata = () => startPlayback()
  video.oncanplay = () => startPlayback()

  tryNext()
}

async function loadPreviewForHit(settings, hit, signal) {
  const key = previewCacheKey(hit)
  try {
    const cached = await readCachedPreviewBlob(key)
    if (cached) {
      const materialized = await materializePreview({
        cacheKey: key,
        blob: cached,
        filename: 'preview.mp4',
      })
      if (materialized?.url) {
        if (materialized.via === 'blob') blobUrls.push(materialized.url)
        return materialized
      }
    }
  } catch {
    /* network */
  }

  const blob = await fetchPreviewBlob(settings, hit, signal)
  if (!blob) return null
  const materialized = await materializePreview({
    cacheKey: key,
    blob,
    filename: 'preview.mp4',
  })
  if (materialized?.via === 'blob' && materialized.url) blobUrls.push(materialized.url)
  return materialized
}

async function renderHits(settings, signal) {
  revokeBlobs()
  els.resultsCount.textContent = String(hits.length)
  if (!hits.length) {
    els.resultsList.innerHTML = '<p class="empty">Keine Treffer.</p>'
    updateSelectionChrome()
    return
  }

  // Paint cards immediately — never wait on posters/previews.
  els.resultsList.innerHTML = ''
  const fragment = document.createDocumentFragment?.() || null
  const nodes = hits.map((hit) => buildHitRow(settings, hit, null))
  if (fragment) {
    for (const node of nodes) fragment.append(node)
    els.resultsList.append(fragment)
  } else {
    for (const node of nodes) els.resultsList.append(node)
  }
  updateSelectionChrome()

  // Progressive poster fill.
  void Promise.all(
    hits.map(async (hit) => {
      if (signal?.aborted) return
      try {
        const blob = await loadPosterForHit(settings, hit, signal)
        if (!blob || signal?.aborted) return
        const url = URL.createObjectURL(blob)
        blobUrls.push(url)
        applyPosterToCard(hit.id, url)
      } catch {
        /* placeholder remains */
      }
    }),
  )

  // Progressive muted MP4 previews via local UXP file URL (blob: often fails in Premiere).
  void mapPool(hits, PREVIEW_CONCURRENCY, async (hit) => {
    if (signal?.aborted) return
    try {
      const materialized = await loadPreviewForHit(settings, hit, signal)
      if (!materialized?.url || signal?.aborted) return
      applyPreviewToCard(hit.id, materialized.urls?.length ? materialized.urls : materialized.url)
    } catch (error) {
      console.warn('[VIDEON] preview load failed', hit.id, error)
    }
  })
}

async function runSearch() {
  const settings = saveSettings(readFormSettings())
  const q = els.searchInput.value.trim()
  if (!q) {
    showBanner('Suchbegriff eingeben.', 'error')
    return
  }
  if (!settings.apiToken) {
    showBanner('API Token in den Einstellungen setzen.', 'error')
    els.settingsPanel.classList.remove('hidden')
    return
  }
  if (!looksLikeApiToken(settings.apiToken)) {
    showBanner('Token sieht ungültig aus (erwartet videon_…).', 'error')
  }

  searchAbort?.abort()
  searchAbort = new AbortController()
  const { signal } = searchAbort

  showBanner('Suche…')
  selected.clear()
  setBusy(true)
  saveLastQuery(q)
  try {
    const payload = await searchMedia(settings, q, 40, signal)
    hits = dedupeSearchHits(
      (payload.items || []).map(normalizeSearchHit).filter((h) => h.mediaAssetId),
    )
    await renderHits(settings, signal)
    const scope = payload.scope ? ` · ${payload.scope}` : ''
    showBanner(
      hits.length ? `${hits.length} Treffer${scope}` : 'Keine Treffer',
      hits.length ? 'ok' : '',
    )
  } catch (error) {
    if (error?.name === 'AbortError') return
    hits = []
    await renderHits(settings, signal)
    showBanner(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    setBusy(false)
  }
}

async function runDryDownload() {
  const settings = saveSettings(readFormSettings())
  const chosen = hits.filter((h) => selected.has(h.id))
  if (!chosen.length) return

  els.progress.classList.remove('hidden')
  els.progressBar.style.width = '0%'
  setBusy(true)

  try {
    for (let i = 0; i < chosen.length; i += 1) {
      const hit = chosen[i]
      showBanner(`Download-Check ${i + 1}/${chosen.length}: ${hit.mediaFilename}`)
      const download = await requestAdobeDownload(settings, hit)
      if (!download?.downloadUrl || !download?.cacheKey) {
        throw new Error('Download-Response unvollständig')
      }
      try {
        await materializeDownload({
          cacheKey: download.cacheKey,
          downloadUrl: download.downloadUrl,
          filename: download.filename,
        })
        showBanner(`Download + Cache OK: ${download.filename}`, 'ok')
        void refreshCacheUi(false)
      } catch (cacheError) {
        console.warn('[VIDEON] cache optional for dry-run', cacheError)
        showBanner(
          `Download OK (${download.kind}, ${download.bytes || '?'} B) — Cache: ${
            cacheError instanceof Error ? cacheError.message : String(cacheError)
          }`,
          'ok',
        )
      }
      els.progressBar.style.width = `${Math.round(((i + 1) / chosen.length) * 100)}%`
    }
  } catch (error) {
    showBanner(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    setBusy(false)
    setTimeout(() => els.progress.classList.add('hidden'), 800)
  }
}

async function runInsert(hitIds) {
  const settings = saveSettings(readFormSettings())
  const idSet = hitIds?.length ? new Set(hitIds) : selected
  const chosen = hits.filter((h) => idSet.has(h.id))
  if (!chosen.length) return

  els.progress.classList.remove('hidden')
  els.progressBar.style.width = '0%'
  setBusy(true)

  const notes = []
  const ae = isAfterEffectsHost(hostInfo)
  if (ae) aeCursorSec = 0

  try {
    for (let i = 0; i < chosen.length; i += 1) {
      const hit = chosen[i]
      showBanner(`Lade ${i + 1}/${chosen.length}: ${hit.mediaFilename}`)
      const download = await requestAdobeDownload(settings, hit)
      const filePath = await materializeDownload({
        cacheKey: download.cacheKey,
        downloadUrl: download.downloadUrl,
        filename: download.filename,
      })
      showBanner(`Import ${i + 1}/${chosen.length}: ${hit.mediaFilename}`)
      const result = ae
        ? await insertHitIntoAfterEffects({
            filePath,
            compName: settings.compName,
            hit,
            sequential: settings.aeSequential !== false,
            gapFrames: settings.aeGapFrames,
            startAtSec: aeCursorSec,
            allowPlan: hostInfo.source === 'preview',
          })
        : await insertHitIntoPremiere({
            filePath,
            binName: settings.binName,
            hit,
            appendToSequence: els.appendSequence?.checked,
          })
      if (!result.ok) throw new Error(result.message)
      if (ae && result.plan && settings.aeSequential !== false) {
        const duration =
          result.plan.durationSec != null
            ? result.plan.durationSec
            : Math.max(0, ((hit.endMs ?? 0) - (hit.startMs ?? 0)) / 1000) || 1
        const gapSec = (Number(settings.aeGapFrames) || 0) / 25
        aeCursorSec = result.plan.compTimeSec + duration + gapSec
      }
      notes.push(result.message)
      els.progressBar.style.width = `${Math.round(((i + 1) / chosen.length) * 100)}%`
    }
    void refreshCacheUi(false)
    showBanner(notes[notes.length - 1] || `${chosen.length} Clip(s) verarbeitet.`, 'ok')
  } catch (error) {
    showBanner(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    setBusy(false)
    setTimeout(() => els.progress.classList.add('hidden'), 800)
  }
}

/**
 * Bind DOM events.
 * Prefer element `on*` properties (UXP-safe). Never call document.addEventListener.
 * Element.addEventListener is tried only when on* assignment is unavailable.
 */
function on(el, eventName, handler) {
  if (!el) return
  const wrapped = (event) => {
    try {
      handler(event)
    } catch (error) {
      console.error('[VIDEON] handler', eventName, error)
      showBanner(error instanceof Error ? error.message : String(error), 'error')
    }
  }
  const key = `on${eventName}`
  try {
    el[key] = wrapped
    return
  } catch (assignError) {
    console.warn('[VIDEON] on* assign failed', eventName, assignError)
  }
  try {
    if (typeof el.addEventListener === 'function') {
      el.addEventListener(eventName, wrapped)
    }
  } catch (listenError) {
    console.error('[VIDEON] addEventListener failed', eventName, listenError)
    showBanner(
      `Event-Bind fehlgeschlagen (${eventName}): ${
        listenError instanceof Error ? listenError.message : String(listenError)
      }`,
      'error',
    )
  }
}

function runTestConnection() {
  void (async () => {
    const settings = saveSettings(readFormSettings())
    if (els.settingsStatus) {
      els.settingsStatus.hidden = false
      els.settingsStatus.textContent = `Teste… (v${PANEL_VERSION})`
    }
    try {
      if (!settings.apiToken) {
        throw new Error('Kein API Token — in Settings einfügen (videon_…)')
      }
      if (!looksLikeApiToken(settings.apiToken)) {
        throw new Error('Token-Format prüfen: videon_ + 64 Hex-Zeichen')
      }
      const ok = await testHealth(settings)
      if (!ok) {
        if (els.settingsStatus) {
          els.settingsStatus.textContent = `Health fehlgeschlagen (v${PANEL_VERSION})`
        }
        return
      }
      if (els.settingsStatus) {
        els.settingsStatus.textContent = `Health OK — Token verify… (v${PANEL_VERSION})`
      }
      const verified = await verifyApiToken(settings)
      if (els.settingsStatus) {
        els.settingsStatus.textContent = `Token OK · owner ${verified.ownerId} (v${PANEL_VERSION})`
      }
      await refreshCollections(true)
    } catch (error) {
      const msg = authErrorHint(error instanceof Error ? error.message : String(error))
      if (els.settingsStatus) {
        els.settingsStatus.textContent = `${msg} (v${PANEL_VERSION})`
      }
      showBanner(msg, 'error')
    }
  })()
}

function bindPanel() {
  on(els.modeScenesBtn, 'click', () => setPanelMode('scenes'))
  on(els.modeCutsBtn, 'click', () => setPanelMode('cuts'))
  on(els.cutsRefreshBtn, 'click', () => {
    void refreshCutsList()
  })
  on(els.pushbackApplyBtn, 'click', () => {
    void confirmPushback(false)
  })
  on(els.pushbackRefreshBtn, 'click', () => {
    void confirmPushback(true)
  })
  on(els.pushbackCancelBtn, 'click', () => {
    hidePushbackConfirm()
    showCutsBanner('Pushback abgebrochen.')
  })

  on(els.settingsToggle, 'click', () => {
    els.settingsPanel?.classList.toggle('hidden')
    if (els.settingsPanel && !els.settingsPanel.classList.contains('hidden')) void refreshCacheUi(false)
  })

  on(els.settingsSave, 'click', () => {
    const draft = readFormSettings()
    const urlCheck = normalizeProductBaseUrl(draft.productBaseUrl)
    if (!urlCheck.ok) {
      if (els.settingsStatus) {
        els.settingsStatus.hidden = false
        els.settingsStatus.textContent = urlCheck.error
      }
      return
    }
    const settings = saveSettings({ ...draft, productBaseUrl: urlCheck.value })
    applySettingsToForm(settings)
    if (els.settingsStatus) {
      els.settingsStatus.hidden = false
      els.settingsStatus.textContent = looksLikeApiToken(settings.apiToken)
        ? 'Gespeichert.'
        : 'Gespeichert — Token-Format prüfen (videon_…).'
    }
  })

  on(els.testConnection, 'click', () => {
    runTestConnection()
  })

  on(els.reloadCollections, 'click', () => {
    void refreshCollections(true)
  })

  on(els.cacheRefresh, 'click', () => {
    void refreshCacheUi(true)
  })

  on(els.cacheClear, 'click', () => {
    void (async () => {
      if (els.settingsStatus) {
        els.settingsStatus.hidden = false
        els.settingsStatus.textContent = 'Cache wird geleert…'
      }
      try {
        const result = await clearCache()
        const openCut = await clearOpenCutCache().catch(() => ({ deleted: 0 }))
        updateCacheStatsLabel({ count: 0, bytes: 0 })
        if (els.settingsStatus) {
          els.settingsStatus.textContent = `Cache geleert (${result.deleted} Media + ${openCut.deleted || 0} Open-Cut)`
        }
      } catch (error) {
        if (els.settingsStatus) {
          els.settingsStatus.textContent = error instanceof Error ? error.message : String(error)
        }
      }
    })()
  })

  on(els.collectionSelect, 'change', onCollectionChange)
  on(els.collectionSelectMain, 'change', onCollectionChange)

  on(els.selectAllBtn, 'click', () => {
    for (const hit of hits) selected.add(hit.id)
    for (const input of els.resultsList?.querySelectorAll('input[type="checkbox"]') || []) {
      input.checked = true
    }
    for (const card of els.resultsList?.querySelectorAll('.hit-card') || []) {
      card.classList.add('selected')
    }
    updateSelectionChrome()
  })
  on(els.selectNoneBtn, 'click', () => {
    selected.clear()
    for (const input of els.resultsList?.querySelectorAll('input[type="checkbox"]') || []) {
      input.checked = false
    }
    for (const card of els.resultsList?.querySelectorAll('.hit-card') || []) {
      card.classList.remove('selected')
    }
    updateSelectionChrome()
  })

  on(els.searchBtn, 'click', () => {
    void runSearch()
  })
  on(els.searchInput, 'keydown', (event) => {
    if (event.key === 'Enter') void runSearch()
  })
  on(els.dryRunBtn, 'click', () => {
    void runDryDownload()
  })
  on(els.insertBtn, 'click', () => {
    void runInsert()
  })
}

function bootPanel() {
  els = queryEls()
  if (els.panelVersion) els.panelVersion.textContent = `v${PANEL_VERSION}`

  const missing = missingRequiredEls()
  if (missing.length) {
    const msg = `Panel-DOM unvollständig (${missing.join(', ')}). Bundle neu bauen / Plugin neu laden.`
    console.error('[VIDEON]', msg)
    if (els.bootStatus) {
      els.bootStatus.hidden = false
      els.bootStatus.textContent = msg
    }
    return false
  }

  try {
    bindPanel()
  } catch (error) {
    const msg = `Boot-Bind fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
    console.error('[VIDEON]', msg, error)
    if (els.bootStatus) {
      els.bootStatus.hidden = false
      els.bootStatus.textContent = msg
    }
    return false
  }

  applySettingsToForm(loadSettings())
  if (els.searchInput) els.searchInput.value = loadLastQuery()
  updateCacheStatsLabel(getCacheStats())
  void refreshCacheUi(false)
  void detectHostApp().then((info) => {
    hostInfo = info
    applyHostChrome()
  })
  if (loadSettings().apiToken) {
    void refreshCollections(false)
  }
  if (els.bootStatus) {
    els.bootStatus.hidden = false
    els.bootStatus.textContent = `Bereit · v${PANEL_VERSION}`
    setTimeout(() => {
      if (els.bootStatus && els.bootStatus.textContent === `Bereit · v${PANEL_VERSION}`) {
        els.bootStatus.hidden = true
        els.bootStatus.textContent = ''
      }
    }, 2500)
  }
  return true
}

/** UXP: never use document DOMContentLoaded listeners — domjs throws. */
function scheduleBoot(attempt = 0) {
  try {
    if (bootPanel()) return
  } catch (error) {
    console.error('[VIDEON] bootPanel threw', error)
    const boot = document.getElementById('boot-status')
    if (boot) {
      boot.hidden = false
      boot.textContent = `Boot-Crash: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  if (attempt >= 40) {
    console.error('[VIDEON] Panel boot failed after retries')
    const boot = document.getElementById('boot-status')
    if (boot) {
      boot.hidden = false
      boot.textContent = `Boot fehlgeschlagen nach Retries · v${PANEL_VERSION}`
    }
    return
  }
  setTimeout(() => scheduleBoot(attempt + 1), 50)
}

scheduleBoot()
