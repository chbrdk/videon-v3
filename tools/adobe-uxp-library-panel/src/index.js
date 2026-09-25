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
import { ENABLE_CUTS_TAB, ENABLE_INPLACE_PATCH, runOpenCut } from './open-cut.js'
import { applyCutPushback, previewCutPushback } from './cut-pushback.js'
import { getCutSequenceLink, markCutSequenceSynced, saveCutSequenceLink } from './cut-link-store.js'
import {
  CUT_CHANGE_WATCH_INTERVAL_MS,
  findStaleLinkedCuts,
  formatStaleCutsBanner,
  isCutStaleVsLink,
} from './cut-change-watch.js'
import {
  canvasLabel,
  formatUpdatedAt,
} from './open-cut-model.js'
import { normalizeCollections } from './collections.js'
import {
  dedupeSearchHits,
  formatRank,
  normalizeSearchHit,
  sceneHitBadgeLabel,
  sceneHitDurationDetailLabel,
  sceneHitDurationLabel,
  sceneHitMsRangeLabel,
  sceneHitOrdinalLabel,
  sceneHitTimingLabel,
} from './hit-model.js'
import { detectHostApp, isAfterEffectsHost } from './host.js'
import { insertHitIntoPremiere } from './premiere.js'
import { looksLikeApiToken, normalizeProductBaseUrl } from './settings.js'

/** Keep in sync with manifest.json / package.json — shown in panel chrome. */
const PANEL_VERSION = '0.1.49'

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
    cutChangeWatch: document.getElementById('cut-change-watch'),
    cutChangeAutoPatch: document.getElementById('cut-change-auto-patch'),
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
    modeTabs: document.getElementById('mode-tabs'),
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
    hitDetail: document.getElementById('hit-detail'),
    hitDetailScrim: document.getElementById('hit-detail-scrim'),
    hitDetailClose: document.getElementById('hit-detail-close'),
    hitDetailTitle: document.getElementById('hit-detail-title'),
    hitDetailMedia: document.getElementById('hit-detail-media'),
    hitDetailPoster: document.getElementById('hit-detail-poster'),
    hitDetailVideo: document.getElementById('hit-detail-video'),
    hitDetailMeta: document.getElementById('hit-detail-meta'),
    hitDetailSnippet: document.getElementById('hit-detail-snippet'),
    hitDetailOpenWeb: document.getElementById('hit-detail-open-web'),
    hitDetailInsert: document.getElementById('hit-detail-insert'),
    hitDetailSelect: document.getElementById('hit-detail-select'),
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
/** @type {string | null} */
let detailHitId = null
/** @type {AbortController | null} */
let detailPreviewAbort = null
/** @type {number} */
let aeCursorSec = 0
/** @type {ReturnType<typeof setInterval> | null} */
let cutChangeWatchTimer = null
/** @type {boolean} */
let cutChangeWatchTickBusy = false
/** @type {string} */
let lastStaleBannerKey = ''

function alertClass(tone = '') {
  if (tone === 'error') return 'ds-alert ds-alert--error panel-banner'
  if (tone === 'ok') return 'ds-alert ds-alert--ok panel-banner'
  return 'ds-alert ds-alert--info panel-banner'
}

function showBanner(message, tone = '') {
  const target = panelMode === 'cuts' ? els.cutsBanner : els.banner
  if (!target) return
  target.hidden = !message
  target.textContent = message || ''
  target.className = alertClass(tone)
}

function stopCutChangeWatch() {
  if (cutChangeWatchTimer != null) {
    clearInterval(cutChangeWatchTimer)
    cutChangeWatchTimer = null
  }
  cutChangeWatchTickBusy = false
}

function startCutChangeWatch() {
  if (!ENABLE_CUTS_TAB || !ENABLE_INPLACE_PATCH) return
  stopCutChangeWatch()
  const settings = loadSettings()
  if (settings.cutChangeWatch === false || !ENABLE_INPLACE_PATCH) return
  cutChangeWatchTimer = setInterval(() => {
    void tickCutChangeWatch()
  }, CUT_CHANGE_WATCH_INTERVAL_MS)
}

function setPanelMode(mode) {
  if (!ENABLE_CUTS_TAB) {
    panelMode = 'scenes'
    els.modeTabs?.classList.add('hidden')
    if (els.modeTabs) els.modeTabs.hidden = true
    els.scenesMode?.classList.remove('hidden')
    els.cutsMode?.classList.add('hidden')
    if (els.cutsMode) {
      els.cutsMode.hidden = true
      els.cutsMode.setAttribute('aria-hidden', 'true')
    }
    stopCutChangeWatch()
    cutsAbort?.abort()
    openCutAbort?.abort()
    openCutBusy = false
    hidePushbackConfirm()
    return
  }
  panelMode = mode === 'cuts' ? 'cuts' : 'scenes'
  els.modeTabs?.classList.remove('hidden')
  if (els.modeTabs) els.modeTabs.hidden = false
  els.modeScenesBtn?.classList.toggle('is-active', panelMode === 'scenes')
  els.modeScenesBtn?.classList.toggle('ds-chip--selected', panelMode === 'scenes')
  els.modeCutsBtn?.classList.toggle('is-active', panelMode === 'cuts')
  els.modeCutsBtn?.classList.toggle('ds-chip--selected', panelMode === 'cuts')
  els.scenesMode?.classList.toggle('hidden', panelMode !== 'scenes')
  els.cutsMode?.classList.toggle('hidden', panelMode !== 'cuts')
  if (els.cutsMode) {
    els.cutsMode.hidden = panelMode !== 'cuts'
    els.cutsMode.setAttribute('aria-hidden', panelMode !== 'cuts' ? 'true' : 'false')
  }

  if (panelMode === 'cuts') {
    searchAbort?.abort()
    openCutAbort?.abort()
    openCutBusy = false
    void refreshCutsList()
    startCutChangeWatch()
  } else {
    stopCutChangeWatch()
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
  if (els.cutChangeWatch) {
    els.cutChangeWatch.checked = Boolean(settings.cutChangeWatch) && ENABLE_INPLACE_PATCH
    els.cutChangeWatch.disabled = !ENABLE_INPLACE_PATCH
  }
  if (els.cutChangeAutoPatch) {
    els.cutChangeAutoPatch.checked = Boolean(settings.cutChangeAutoPatch) && ENABLE_INPLACE_PATCH
    els.cutChangeAutoPatch.disabled = !ENABLE_INPLACE_PATCH
  }
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
    cutChangeWatch: ENABLE_INPLACE_PATCH && els.cutChangeWatch ? els.cutChangeWatch.checked : false,
    cutChangeAutoPatch: ENABLE_INPLACE_PATCH && els.cutChangeAutoPatch ? els.cutChangeAutoPatch.checked : false,
  }
}

function onCollectionChange(event) {
  const id = event.target.value
  if (els.collectionSelect) els.collectionSelect.value = id
  if (els.collectionSelectMain) els.collectionSelectMain.value = id
  if (els.defaultProjectId) els.defaultProjectId.value = id
  saveSettings({ defaultPlatformProjectId: id })
  if (ENABLE_CUTS_TAB && panelMode === 'cuts') void refreshCutsList()
}

function showCutsBanner(message, tone = '') {
  if (!els.cutsBanner) return
  els.cutsBanner.hidden = !message
  els.cutsBanner.textContent = message || ''
  els.cutsBanner.className = alertClass(tone)
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

  const settings = loadSettings()
  const platformProjectId = settings.defaultPlatformProjectId || ''
  const link = platformProjectId ? getCutSequenceLink(platformProjectId, cut.id) : null
  const stale = Boolean(
    link && isCutStaleVsLink(cut.updatedAt, link.syncedUpdatedAt, link.openedAt),
  )
  if (stale) card.classList.add('is-stale')

  const title = document.createElement('div')
  title.className = 'cut-card-title'
  title.textContent = cut.name
  if (stale) {
    const badge = document.createElement('span')
    badge.className = 'cut-card-stale-badge'
    badge.textContent = 'neu in Videon'
    title.append(' ', badge)
  }

  const meta = document.createElement('div')
  meta.className = 'cut-card-meta'
  const parts = [canvasLabel(cut)]
  if (cut.sceneCount != null) parts.push(`${cut.sceneCount} Szenen`)
  parts.push(formatUpdatedAt(cut.updatedAt))
  if (link) parts.push('verknüpft')
  meta.textContent = parts.join(' · ')

  const actions = document.createElement('div')
  actions.className = 'cut-card-actions'

  const openBtn = makeDsBtn('primary', 'sm', 'In Premiere öffnen')
  on(openBtn, 'click', (event) => {
    event.stopPropagation?.()
    void startOpenCut(cut, { handoff: true, replaceLinked: false, forceFreshExport: false })
  })

  const replaceBtn = makeDsBtn('ghost', 'sm', 'Cut neu laden')
  replaceBtn.title = 'ZIP-Import — ersetzt die verknüpfte Sequenz (Live-Effekte gehen verloren)'
  on(replaceBtn, 'click', (event) => {
    event.stopPropagation?.()
    void startOpenCut(cut, {
      handoff: true,
      replaceLinked: true,
      forceFreshExport: true,
      forceZipReplace: true,
    })
  })

  const cacheBtn = makeDsBtn('ghost', 'sm', 'ZIP cachen')
  on(cacheBtn, 'click', (event) => {
    event.stopPropagation?.()
    void startOpenCut(cut, { handoff: false, replaceLinked: false, forceFreshExport: false })
  })

  const pushBtn = makeDsBtn('ghost', 'sm', 'Cut aktualisieren')
  on(pushBtn, 'click', (event) => {
    event.stopPropagation?.()
    void startCutPushback(cut)
  })

  actions.append(openBtn, replaceBtn, pushBtn, cacheBtn)
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

async function refreshCutsList(options = {}) {
  const quiet = Boolean(options.quiet)
  const settings = quiet ? loadSettings() : saveSettings(readFormSettings())
  const platformProjectId = settings.defaultPlatformProjectId || ''
  if (!platformProjectId) {
    cuts = []
    if (els.cutsCount) els.cutsCount.textContent = '0'
    if (els.cutsList) {
      els.cutsList.innerHTML =
        '<p class="empty">Collection pinnen (nicht „alle“), dann Cuts laden.</p>'
    }
    if (!quiet) showCutsBanner('Für Cuts eine Collection wählen.', 'error')
    return
  }
  if (!settings.apiToken) {
    if (!quiet) showCutsBanner('API Token in den Einstellungen setzen.', 'error')
    return
  }

  cutsAbort?.abort()
  cutsAbort = new AbortController()
  const { signal } = cutsAbort
  if (!quiet) showCutsBanner('Cuts laden…')
  try {
    cuts = await listCuts(settings, platformProjectId, signal)
    if (signal.aborted) return
    renderCutsList()
    const stale = applyStaleCutUi(settings, platformProjectId)
    if (!quiet) {
      if (stale.length) {
        /* banner already set by applyStaleCutUi */
      } else {
        showCutsBanner(cuts.length ? `${cuts.length} Cut(s)` : 'Keine Cuts.', cuts.length ? 'ok' : '')
      }
    }
  } catch (error) {
    if (signal.aborted) return
    const msg = error instanceof Error ? error.message : String(error)
    if (!quiet) showCutsBanner(msg, 'error')
  }
}

function applyStaleCutUi(settings, platformProjectId) {
  const stale = findStaleLinkedCuts(cuts, (cutId) => getCutSequenceLink(platformProjectId, cutId))
  const autoPatch = Boolean(settings.cutChangeAutoPatch)
  const banner = formatStaleCutsBanner(stale, { autoPatch })
  const key = stale.map((row) => `${row.cut.id}:${row.cut.updatedAt}`).join('|')
  if (banner && key !== lastStaleBannerKey) {
    lastStaleBannerKey = key
    showCutsBanner(banner, autoPatch ? '' : 'ok')
  }
  if (!stale.length) lastStaleBannerKey = ''
  return stale
}

async function tickCutChangeWatch() {
  if (!ENABLE_INPLACE_PATCH) return
  if (panelMode !== 'cuts' || cutChangeWatchTickBusy || openCutBusy) return
  const settings = loadSettings()
  if (settings.cutChangeWatch === false) return
  const platformProjectId = settings.defaultPlatformProjectId || ''
  if (!platformProjectId || !settings.apiToken) return
  if (isAfterEffectsHost(hostInfo)) return

  cutChangeWatchTickBusy = true
  try {
    await refreshCutsList({ quiet: true })
    const stale = applyStaleCutUi(settings, platformProjectId)
    if (!stale.length || !settings.cutChangeAutoPatch) return
    // Auto-patch one stale Cut per tick (in-place only) — gated by ENABLE_INPLACE_PATCH.
    const next = stale[0]?.cut
    if (!next) return
    await startOpenCut(next, {
      handoff: true,
      replaceLinked: true,
      forceFreshExport: false,
      forceZipReplace: false,
      fromChangeWatch: true,
    })
  } finally {
    cutChangeWatchTickBusy = false
  }
}

async function startOpenCut(cut, options = {}) {
  const handoff = options.handoff !== false
  const replaceLinked = Boolean(options.replaceLinked)
  const forceFreshExport = Boolean(options.forceFreshExport)
  const forceZipReplace = Boolean(options.forceZipReplace)
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
    forceZipReplace: forceZipReplace && replaceLinked,
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
        syncedUpdatedAt: cut.updatedAt || new Date().toISOString(),
      })
      markCutSequenceSynced(platformProjectId, cut.id, cut.updatedAt || new Date().toISOString())
      // Refresh list stamp so stale badge clears.
      const idx = cuts.findIndex((c) => c.id === cut.id)
      if (idx >= 0 && cut.updatedAt) cuts[idx] = { ...cuts[idx], updatedAt: cut.updatedAt }
      renderCutsList()
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
      premiereV1TrackSidecarXml: preview.premiereV1TrackSidecarXml ?? null,
      premiereSequenceExtrasXml: preview.premiereSequenceExtrasXml ?? null,
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
    // Wave P4: startOpenCut tries in-place patch first when clip IDs match.
    if (withSequenceReplace) {
      showCutsBanner('Cut OK — Premiere wird aktualisiert…', 'ok')
      openCutBusy = false
      await startOpenCut(
        { ...cut, updatedAt: nowIso, name: cut.name || preview.sequenceName || cut.id },
        { handoff: true, replaceLinked: true, forceFreshExport: true, forceZipReplace: true },
      )
      showCutsBanner(
        'Cut aktualisiert. Sequenz per ZIP ersetzt (Live-Effekte nur, wenn im Sidecar).',
        'ok',
      )
      return
    }

    openCutBusy = false
    updateCutRowStatus(preview.cutId, 'Cut aktualisiert', false)
    showCutsBanner(
      'Cut entspricht der Sequenz. (Premiere bleibt — kein neuer Import.)',
      'ok',
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

/** UXP: native <button> keeps Spectrum chrome — use div[role=button] + aria-disabled. */
function setControlDisabled(el, disabled) {
  if (!el) return
  const on = Boolean(disabled)
  if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
    el.disabled = on
  }
  el.setAttribute('aria-disabled', on ? 'true' : 'false')
  el.classList.toggle('is-disabled', on)
  if (el.getAttribute('role') === 'button') {
    el.setAttribute('tabindex', on ? '-1' : '0')
  }
}

function setBusy(busy) {
  setControlDisabled(els.searchBtn, busy)
  setControlDisabled(els.dryRunBtn, busy)
  setControlDisabled(els.insertBtn, busy)
  for (const btn of els.resultsList?.querySelectorAll('.hit-insert-btn') || []) {
    setControlDisabled(btn, busy)
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

function makeDsBtn(variant, size, labelText, extraClass = '') {
  // Native <button> in Premiere UXP keeps Spectrum orange chrome — use div.
  const btn = document.createElement('div')
  btn.setAttribute('role', 'button')
  btn.setAttribute('tabindex', '0')
  btn.className = `ds-btn ds-btn--${variant} ds-btn--${size} ds-btn--square${extraClass ? ` ${extraClass}` : ''}`
  const label = document.createElement('span')
  label.className = 'ds-btn__label'
  label.textContent = labelText
  btn.append(label)
  bindRoleButtonKeys(btn)
  return btn
}

function bindRoleButtonKeys(el) {
  if (!el || el.getAttribute('data-key-bound') === '1') return
  el.setAttribute('data-key-bound', '1')
  on(el, 'keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (el.getAttribute('aria-disabled') === 'true' || el.classList.contains('is-disabled')) return
    event.preventDefault?.()
    el.click?.()
  })
}

function bindAllRoleButtons(root = document) {
  for (const el of root.querySelectorAll?.('[role="button"]') || []) {
    bindRoleButtonKeys(el)
  }
}

function buildHitRow(settings, hit, posterUrl) {
  const row = document.createElement('article')
  row.className = `ds-card ds-card--media ds-card--structured hit-card${
    selected.has(hit.id) ? ' is-selected selected' : ''
  }`
  row.setAttribute('data-hit-id', hit.id)
  row.title = 'Klicken: Details anzeigen'

  const media = document.createElement('div')
  media.className = 'ds-card__media hit-card-media'

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
  video.defaultMuted = true
  video.loop = true
  video.autoplay = true
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('muted', '')
  video.setAttribute('loop', '')
  video.setAttribute('autoplay', '')
  video.setAttribute('playsinline', '')
  // Keep laid out (opacity 0 via CSS) — UXP often skips decode when display:none.

  const timing = sceneHitTimingLabel(hit)
  const duration = sceneHitDurationLabel(hit)
  const badgeLabel = sceneHitBadgeLabel(hit)
  if (badgeLabel) {
    const badge = document.createElement('span')
    badge.className = 'ds-badge ds-badge--neutral hit-card-badge'
    badge.textContent = badgeLabel
    badge.title = [timing && `In/Out ${timing}`, duration && `Dauer ${duration}`]
      .filter(Boolean)
      .join(' · ')
    media.append(badge)
  }

  media.append(img, video)

  const body = document.createElement('div')
  body.className = 'ds-card__body'

  const title = document.createElement('div')
  title.className = 'ds-card__title'
  title.textContent = hit.mediaFilename || 'Clip'
  title.title = hit.mediaFilename || ''

  const meta = document.createElement('div')
  meta.className = 'ds-card__meta'
  const ordinal = sceneHitOrdinalLabel(hit, 0)
  const sceneBadge = document.createElement('span')
  sceneBadge.className = 'ds-badge ds-badge--neutral'
  sceneBadge.textContent = ordinal
  sceneBadge.title = hit.sceneKey ? `sceneKey: ${hit.sceneKey}` : 'Szene'
  meta.append(sceneBadge)
  if (hit.hasSceneBounds && timing) {
    const timeBadge = document.createElement('span')
    timeBadge.className = 'ds-badge ds-badge--neutral'
    timeBadge.textContent = timing
    timeBadge.title = duration ? `Dauer ${duration}` : timing
    meta.append(timeBadge)
  } else {
    const fullBadge = document.createElement('span')
    fullBadge.className = 'ds-badge ds-badge--neutral'
    fullBadge.textContent = 'voller Clip'
    meta.append(fullBadge)
  }
  const rank = formatRank(hit.rank)
  const projectBits = [hit.projectName, rank ? `rank ${rank}` : null].filter(Boolean)
  if (projectBits.length) {
    const projectMeta = document.createElement('span')
    projectMeta.textContent = projectBits.join(' · ')
    meta.append(projectMeta)
  }

  const snippet = document.createElement('div')
  snippet.className = 'ds-card__snippet'
  if (hit.searchText?.trim()) {
    snippet.textContent = hit.searchText
    snippet.title = hit.searchText
  } else {
    snippet.classList.add('is-empty')
    snippet.textContent = 'Kein Search-Snippet'
  }

  const actionsWrap = document.createElement('div')
  actionsWrap.className = 'ds-card__actions'
  const actions = document.createElement('div')
  actions.className = 'ds-card-actions ds-card-actions--hairline'

  const showBtn = makeDsBtn('ghost', 'xs', 'Anzeigen', 'hit-show-btn')
  showBtn.title = 'Szene-Details & Preview'
  on(showBtn, 'click', (event) => {
    event.stopPropagation?.()
    event.preventDefault?.()
    void openHitDetail(hit.id)
  })

  const insertOne = makeDsBtn('primary', 'xs', '+', 'hit-insert-btn')
  insertOne.title = 'In Premiere / AE einfügen'
  on(insertOne, 'click', (event) => {
    event.stopPropagation?.()
    event.preventDefault?.()
    void runInsert([hit.id])
  })

  actions.append(showBtn, insertOne)
  actionsWrap.append(actions)
  body.append(title, meta, snippet, actionsWrap)
  row.append(media, body)

  // Card click → detail (selection via Alle/Keine or detail “Auswählen”)
  on(row, 'click', (event) => {
    const target = event.target
    if (
      target === insertOne ||
      target === showBtn ||
      (target && insertOne.contains?.(target)) ||
      (target && showBtn.contains?.(target))
    ) {
      return
    }
    void openHitDetail(hit.id)
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

function normalizePreviewCandidates(previewSrcOrList) {
  if (Array.isArray(previewSrcOrList)) return previewSrcOrList.filter(Boolean)
  return previewSrcOrList ? [previewSrcOrList] : []
}

/**
 * UXP <video> often will not decode while display:none.
 * Keep the element laid out (opacity 0) until `playing`, then reveal.
 * Adobe play() may resolve even on failure — advance candidates on `error`.
 */
function bindUxpVideoPreview(video, previewSrcOrList, options = {}) {
  const candidates = normalizePreviewCandidates(previewSrcOrList)
  const label = options.label || 'video'
  if (!video || !candidates.length) return

  let attempt = 0
  let settled = false
  let gen = (video._videonPreviewGen || 0) + 1
  video._videonPreviewGen = gen

  const reveal = () => {
    video.classList.add('is-visible')
    if (typeof options.onReveal === 'function') options.onReveal()
  }

  const conceal = () => {
    video.classList.remove('is-visible')
    if (typeof options.onConceal === 'function') options.onConceal()
  }

  const armMuted = () => {
    try {
      video.muted = true
      video.defaultMuted = true
      video.volume = 0
      video.setAttribute('muted', '')
      video.playsInline = true
      video.loop = true
      video.autoplay = true
    } catch {
      /* ignore */
    }
  }

  const tryPlay = () => {
    if (video._videonPreviewGen !== gen || settled) return
    armMuted()
    try {
      const p = video.play?.()
      if (p && typeof p.then === 'function') {
        p.then(() => {
          if (video._videonPreviewGen !== gen || settled) return
          // UXP may resolve play() even when nothing plays — wait for `playing`.
          setTimeout(() => {
            if (video._videonPreviewGen !== gen || settled) return
            if (!video.paused && video.readyState >= 2) {
              settled = true
              reveal()
              return
            }
            console.warn(`[VIDEON] ${label} play stalled`, video.currentSrc || video.src)
            tryNext()
          }, 800)
        }).catch((error) => {
          console.warn(`[VIDEON] ${label} play rejected`, error)
          if (video._videonPreviewGen !== gen) return
          settled = false
          tryNext()
        })
      }
    } catch (error) {
      console.warn(`[VIDEON] ${label} play threw`, error)
      settled = false
      tryNext()
    }
  }

  const tryNext = () => {
    if (video._videonPreviewGen !== gen) return
    if (attempt >= candidates.length) {
      conceal()
      console.warn(`[VIDEON] ${label}: all src candidates failed`, candidates)
      return
    }
    const src = candidates[attempt]
    attempt += 1
    settled = false
    conceal()
    console.info(`[VIDEON] ${label} try src`, src)
    armMuted()
    try {
      video.pause?.()
    } catch {
      /* ignore */
    }
    video.removeAttribute('src')
    video.src = src
    try {
      video.load?.()
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (video._videonPreviewGen !== gen || settled) return
      if (video.readyState >= 2) tryPlay()
    }, 450)
  }

  video.onerror = () => {
    if (video._videonPreviewGen !== gen) return
    console.warn(
      `[VIDEON] ${label} error`,
      video.error?.message || video.error,
      'src=',
      video.currentSrc || video.src,
    )
    settled = false
    tryNext()
  }
  video.onplaying = () => {
    if (video._videonPreviewGen !== gen || settled) return
    settled = true
    reveal()
  }
  video.onloadeddata = () => tryPlay()
  video.oncanplay = () => tryPlay()

  tryNext()
}

function applyPreviewToCard(hitId, previewSrcOrList) {
  const card = findHitCard(hitId)
  if (!card) return
  const video = card.querySelector('video.hit-card-preview')
  const img = card.querySelector('img.hit-card-thumb')
  if (!video) return

  bindUxpVideoPreview(video, previewSrcOrList, {
    label: `card:${hitId}`,
    onReveal: () => {
      if (img) img.classList.add('hit-thumb-under')
    },
    onConceal: () => {
      if (img) img.classList.remove('hit-thumb-under')
    },
  })
}

function appendDetailKv(key, value) {
  if (!els.hitDetailMeta || value == null || value === '') return
  const row = document.createElement('div')
  row.className = 'hit-detail-kv-row'
  const k = document.createElement('div')
  k.className = 'hit-detail-kv-key'
  k.textContent = key
  const v = document.createElement('div')
  v.className = 'hit-detail-kv-val'
  v.textContent = String(value)
  row.append(k, v)
  els.hitDetailMeta.append(row)
}

function sizeHitDetailMedia() {
  const media = els.hitDetailMedia
  const sheet = els.hitDetail?.querySelector?.('.hit-detail-sheet')
  if (!media || !sheet) return
  const width = Math.max(sheet.clientWidth || media.clientWidth || 0, 160)
  // Scale with panel width (16:9); taller panels allow a larger share
  const ideal = Math.round((width * 9) / 16)
  const panelH = els.hitDetail?.clientHeight || 0
  const cap = panelH > 0 ? Math.floor(panelH * 0.5) : ideal
  const height = Math.max(140, Math.min(ideal, cap || ideal, 360))
  media.style.height = `${height}px`
  media.style.maxHeight = `${Math.max(cap, 140)}px`
}

function fillHitDetailMeta(hit) {
  if (els.hitDetailMeta) els.hitDetailMeta.textContent = ''
  appendDetailKv('Datei', hit.mediaFilename)
  appendDetailKv('Typ', hit.hasSceneBounds ? 'Szene' : 'voller Clip')
  appendDetailKv('Szene', sceneHitOrdinalLabel(hit, 0))
  if (hit.sceneKey) appendDetailKv('sceneKey', hit.sceneKey)
  appendDetailKv('In/Out', sceneHitTimingLabel(hit) || '—')
  appendDetailKv('Dauer', sceneHitDurationDetailLabel(hit) || sceneHitDurationLabel(hit))
  appendDetailKv('Zeit (ms)', sceneHitMsRangeLabel(hit))
  appendDetailKv('Collection', hit.projectName)
  appendDetailKv('Rank', formatRank(hit.rank))
  appendDetailKv('Analysis', hit.analysisRunId)
  appendDetailKv('Asset', hit.mediaAssetId)
  appendDetailKv('Project-ID', hit.platformProjectId)
  appendDetailKv('Hit-ID', hit.id)
  appendDetailKv('Deep Link', hit.href)
  const q = els.searchInput?.value?.trim?.()
  if (q) appendDetailKv('Query', q)
}

function resetDetailMedia() {
  const video = els.hitDetailVideo
  const poster = els.hitDetailPoster
  if (video) {
    video._videonPreviewGen = (video._videonPreviewGen || 0) + 1
    try {
      video.pause?.()
    } catch {
      /* ignore */
    }
    video.removeAttribute('src')
    try {
      video.load?.()
    } catch {
      /* ignore */
    }
    video.classList.remove('is-visible')
    video.style.display = ''
    video.onerror = null
    video.onloadeddata = null
    video.oncanplay = null
    video.onplaying = null
  }
  if (poster) {
    poster.classList.remove('is-under')
    poster.removeAttribute('src')
    poster.alt = ''
  }
}

function applyPreviewToDetail(previewSrcOrList) {
  const video = els.hitDetailVideo
  const poster = els.hitDetailPoster
  if (!video) return

  bindUxpVideoPreview(video, previewSrcOrList, {
    label: 'detail',
    onReveal: () => {
      if (poster) poster.classList.add('is-under')
    },
    onConceal: () => {
      if (poster) poster.classList.remove('is-under')
    },
  })
}

function syncDetailSelectLabel() {
  const label = els.hitDetailSelect?.querySelector?.('.ds-btn__label')
  if (!label || !detailHitId) return
  label.textContent = selected.has(detailHitId) ? 'Abwählen' : 'Auswählen'
}

function setHitSelected(hitId, on) {
  if (!hitId) return
  if (on) selected.add(hitId)
  else selected.delete(hitId)
  const card = findHitCard(hitId)
  if (card) {
    card.classList.toggle('selected', on)
    card.classList.toggle('is-selected', on)
  }
  updateSelectionChrome()
  if (detailHitId === hitId) syncDetailSelectLabel()
}

function closeHitDetail() {
  detailHitId = null
  if (detailPreviewAbort) {
    detailPreviewAbort.abort()
    detailPreviewAbort = null
  }
  resetDetailMedia()
  if (els.hitDetail) {
    els.hitDetail.classList.add('hidden')
    els.hitDetail.hidden = true
    els.hitDetail.style.display = 'none'
    els.hitDetail.setAttribute('aria-hidden', 'true')
  }
}

async function openHitDetail(hitId) {
  if (!els.hitDetail) {
    els.hitDetail = document.getElementById('hit-detail')
    els.hitDetailScrim = document.getElementById('hit-detail-scrim')
    els.hitDetailClose = document.getElementById('hit-detail-close')
    els.hitDetailTitle = document.getElementById('hit-detail-title')
    els.hitDetailMedia = document.getElementById('hit-detail-media')
    els.hitDetailPoster = document.getElementById('hit-detail-poster')
    els.hitDetailVideo = document.getElementById('hit-detail-video')
    els.hitDetailMeta = document.getElementById('hit-detail-meta')
    els.hitDetailSnippet = document.getElementById('hit-detail-snippet')
    els.hitDetailOpenWeb = document.getElementById('hit-detail-open-web')
    els.hitDetailInsert = document.getElementById('hit-detail-insert')
    els.hitDetailSelect = document.getElementById('hit-detail-select')
  }
  const hit = hits.find((item) => item.id === hitId)
  if (!hit) {
    showBanner('Treffer nicht gefunden.', 'error')
    return
  }
  if (!els.hitDetail) {
    showBanner('Detail-Overlay fehlt im Panel-DOM — Plugin neu laden.', 'error')
    return
  }
  if (!els.hitDetailMedia) els.hitDetailMedia = document.getElementById('hit-detail-media')
  detailHitId = hit.id
  const settings = readFormSettings()

  if (els.hitDetailTitle) els.hitDetailTitle.textContent = hit.mediaFilename || 'Szene'
  fillHitDetailMeta(hit)
  syncDetailSelectLabel()

  if (els.hitDetailSnippet) {
    if (hit.searchText?.trim()) {
      els.hitDetailSnippet.classList.remove('is-empty')
      els.hitDetailSnippet.textContent = hit.searchText
    } else {
      els.hitDetailSnippet.classList.add('is-empty')
      els.hitDetailSnippet.textContent = 'Kein Index-Text (Summary/Tags)'
    }
  }

  resetDetailMedia()
  const card = findHitCard(hit.id)
  const cardThumb = card?.querySelector?.('img.hit-card-thumb')
  if (els.hitDetailPoster && cardThumb?.src) {
    els.hitDetailPoster.src = cardThumb.src
    els.hitDetailPoster.alt = hit.mediaFilename || 'Szene'
  }

  els.hitDetail.classList.remove('hidden')
  els.hitDetail.hidden = false
  els.hitDetail.style.display = 'flex'
  els.hitDetail.setAttribute('aria-hidden', 'false')
  sizeHitDetailMedia()
  // Second pass after layout — UXP may report 0 width on first paint
  setTimeout(() => {
    if (detailHitId === hit.id) sizeHitDetailMedia()
  }, 50)
  console.info('[VIDEON] openHitDetail', hit.id)

  // Prefer an already-working card <video> src first (same cache file).
  const cardVideo = card?.querySelector?.('video.hit-card-preview')
  const warmSrc =
    cardVideo?.classList?.contains('is-visible') && (cardVideo.currentSrc || cardVideo.src)
      ? [cardVideo.currentSrc || cardVideo.src]
      : []

  if (detailPreviewAbort) detailPreviewAbort.abort()
  detailPreviewAbort = new AbortController()
  const signal = detailPreviewAbort.signal
  try {
    const materialized = await loadPreviewForHit(settings, hit, signal)
    if (signal.aborted || detailHitId !== hit.id) return
    const urls = materialized?.urls?.length
      ? materialized.urls
      : materialized?.url
        ? [materialized.url]
        : []
    const merged = [...warmSrc, ...urls].filter((u, i, arr) => u && arr.indexOf(u) === i)
    applyPreviewToDetail(merged)
  } catch (error) {
    if (signal.aborted) return
    console.warn('[VIDEON] detail preview failed', error)
    if (warmSrc.length) applyPreviewToDetail(warmSrc)
  }
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
  closeHitDetail()
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
  bindAllRoleButtons(document)
  if (ENABLE_CUTS_TAB) {
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
  }
  setPanelMode('scenes')

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
    if (ENABLE_CUTS_TAB && panelMode === 'cuts') startCutChangeWatch()
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
    for (const card of els.resultsList?.querySelectorAll('.hit-card') || []) {
      card.classList.add('selected')
      card.classList.add('is-selected')
    }
    updateSelectionChrome()
    syncDetailSelectLabel()
  })
  on(els.selectNoneBtn, 'click', () => {
    selected.clear()
    for (const card of els.resultsList?.querySelectorAll('.hit-card') || []) {
      card.classList.remove('selected')
      card.classList.remove('is-selected')
    }
    updateSelectionChrome()
    syncDetailSelectLabel()
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

  on(els.hitDetailClose, 'click', () => {
    closeHitDetail()
  })
  on(els.hitDetailScrim, 'click', () => {
    closeHitDetail()
  })
  on(els.hitDetailSelect, 'click', () => {
    if (!detailHitId) return
    setHitSelected(detailHitId, !selected.has(detailHitId))
  })
  on(els.hitDetailOpenWeb, 'click', () => {
    const hit = hits.find((item) => item.id === detailHitId)
    if (!hit) return
    const settings = readFormSettings()
    const href = absoluteProductHref(settings, hit.href)
    if (!href) {
      showBanner('Kein Deep Link am Treffer.', 'error')
      return
    }
    void openExternal(href)
  })
  on(els.hitDetailInsert, 'click', () => {
    const id = detailHitId
    if (!id) return
    void runInsert([id])
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
