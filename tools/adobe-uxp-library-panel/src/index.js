import { insertHitIntoAfterEffects } from './aftereffects.js'
import {
  absoluteProductHref,
  fetchFrameBlob,
  listCollections,
  loadLastQuery,
  loadSettings,
  requestAdobeDownload,
  saveLastQuery,
  saveSettings,
  searchMedia,
  testHealth,
} from './api.js'
import { loadNativeModule } from './native.js'
import {
  clearCache,
  formatCacheBytes,
  getCacheStats,
  materializeDownload,
  materializePoster,
  posterCacheKey,
  readCachedPosterBlob,
  refreshCacheStats,
} from './cache.js'
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
const PANEL_VERSION = '0.1.11'

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
/** @type {{ id: 'PPRO' | 'AEFT', source: string }} */
let hostInfo = { id: 'PPRO', source: 'default' }
/** @type {number} */
let aeCursorSec = 0

function showBanner(message, tone = '') {
  els.banner.hidden = !message
  els.banner.textContent = message || ''
  els.banner.className = `banner${tone ? ` ${tone}` : ''}`
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
    if (showStatus) {
      els.settingsStatus.textContent = error instanceof Error ? error.message : String(error)
    }
    showBanner(error instanceof Error ? error.message : String(error), 'error')
  }
}

function buildHitRow(settings, hit, posterUrl) {
  const row = document.createElement('article')
  row.className = 'hit'

  const check = document.createElement('input')
  check.type = 'checkbox'
  check.checked = selected.has(hit.id)
  on(check, 'change', () => {
    if (check.checked) selected.add(hit.id)
    else selected.delete(hit.id)
    updateSelectionChrome()
  })

  const img = document.createElement('img')
  img.alt = ''
  if (posterUrl) img.src = posterUrl
  else img.classList.add('hit-ph')

  const body = document.createElement('div')
  const title = document.createElement('div')
  title.className = 'hit-title'
  title.textContent = hit.mediaFilename

  const meta = document.createElement('div')
  meta.className = 'hit-meta'
  const timing = sceneHitTimingLabel(hit)
  const duration = sceneHitDurationLabel(hit)
  const rank = formatRank(hit.rank)
  meta.textContent = [
    hit.projectName,
    timing,
    duration ? `Δ ${duration}` : null,
    hit.sceneKey,
    rank ? `rank ${rank}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const snippet = document.createElement('div')
  snippet.className = 'hit-meta'
  snippet.textContent = hit.searchText

  const actions = document.createElement('div')
  actions.className = 'hit-actions'
  const open = document.createElement('button')
  open.type = 'button'
  open.textContent = 'In VIDEON öffnen'
  on(open, 'click', () => {
    const href = absoluteProductHref(settings, hit.href)
    if (!href) {
      showBanner('Kein Deep Link am Treffer.', 'error')
      return
    }
    void openExternal(href)
  })
  actions.append(open)

  body.append(title, meta, snippet, actions)
  row.append(check, img, body)
  return row
}

async function renderHits(settings, signal) {
  revokeBlobs()
  els.resultsCount.textContent = String(hits.length)
  if (!hits.length) {
    els.resultsList.innerHTML = '<p class="empty">Keine Treffer.</p>'
    updateSelectionChrome()
    return
  }

  els.resultsList.innerHTML = ''
  const posters = await Promise.all(
    hits.map(async (hit) => {
      try {
        const blob = await loadPosterForHit(settings, hit, signal)
        if (!blob) return null
        const url = URL.createObjectURL(blob)
        blobUrls.push(url)
        return url
      } catch {
        return null
      }
    }),
  )

  if (signal?.aborted) return

  hits.forEach((hit, index) => {
    els.resultsList.append(buildHitRow(settings, hit, posters[index]))
  })
  updateSelectionChrome()
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

async function runInsert() {
  const settings = saveSettings(readFormSettings())
  const chosen = hits.filter((h) => selected.has(h.id))
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
      const ok = await testHealth(settings)
      if (els.settingsStatus) {
        els.settingsStatus.textContent = ok
          ? `Health OK (v${PANEL_VERSION})`
          : `Health fehlgeschlagen (v${PANEL_VERSION})`
      }
      if (ok) await refreshCollections(false)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (els.settingsStatus) {
        els.settingsStatus.textContent = `${msg} (v${PANEL_VERSION})`
      }
      showBanner(msg, 'error')
    }
  })()
}

function bindPanel() {
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
        updateCacheStatsLabel({ count: 0, bytes: 0 })
        if (els.settingsStatus) {
          els.settingsStatus.textContent = `Cache geleert (${result.deleted} Datei(en) entfernt)`
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
    updateSelectionChrome()
  })
  on(els.selectNoneBtn, 'click', () => {
    selected.clear()
    for (const input of els.resultsList?.querySelectorAll('input[type="checkbox"]') || []) {
      input.checked = false
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
