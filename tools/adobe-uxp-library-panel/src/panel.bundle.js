(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // src/native.js
  async function loadNativeModule(id) {
    if (typeof __require === "function") {
      try {
        if (id === "uxp") return __require("uxp");
        if (id === "premierepro") return __require("premierepro");
        if (id === "aeft") return __require("aeft");
        if (id === "aftereffects") return __require("aftereffects");
        return __require(id);
      } catch {
      }
    }
    if (id === "uxp") return import("uxp");
    if (id === "premierepro") return import("premierepro");
    if (id === "aeft") return import("aeft");
    if (id === "aftereffects") return import("aftereffects");
    return import(id);
  }

  // src/premiere-path.js
  function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }
  function pathBasename(filePath) {
    const normalized = String(filePath || "").replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || normalized;
  }
  function pathsLikelyMatch(a, b) {
    const left = String(a || "").replace(/\\/g, "/").toLowerCase();
    const right = String(b || "").replace(/\\/g, "/").toLowerCase();
    if (!left || !right) return false;
    if (left === right) return true;
    return left.endsWith("/" + pathBasename(right)) || right.endsWith("/" + pathBasename(left));
  }
  function assertLocalImportPath(filePath) {
    const path = String(filePath || "").trim();
    if (!path) throw new Error("Lokaler Medienpfad fehlt");
    if (isHttpUrl(path)) {
      throw new Error("Premiere braucht eine lokale Datei \u2014 Cache-Download fehlgeschlagen");
    }
    return path;
  }

  // src/ae-placement.js
  function msToSeconds(ms) {
    return Math.max(0, Number(ms) || 0) / 1e3;
  }
  function sceneSourceWindowSec(hit) {
    if (hit.startMs == null || hit.endMs == null || hit.endMs <= hit.startMs) return null;
    const inPointSec = msToSeconds(hit.startMs);
    const outPointSec = msToSeconds(hit.endMs);
    return {
      inPointSec,
      outPointSec,
      durationSec: Math.max(0, outPointSec - inPointSec)
    };
  }
  function aeLayerTiming(hit, compTimeSec) {
    const window2 = sceneSourceWindowSec(hit);
    const t = Math.max(0, Number(compTimeSec) || 0);
    if (!window2) {
      return {
        startTime: t,
        inPoint: t,
        outPoint: null,
        durationSec: null,
        fullFootage: true
      };
    }
    return {
      startTime: t - window2.inPointSec,
      inPoint: t,
      outPoint: t + window2.durationSec,
      durationSec: window2.durationSec,
      fullFootage: false
    };
  }
  function planAeInserts(hits2, opts = {}) {
    const sequential = opts.sequential !== false;
    const fps = Number(opts.fps) > 0 ? Number(opts.fps) : 25;
    const gapFrames = Math.max(0, Number(opts.gapFrames) || 0);
    const gapSec = gapFrames / fps;
    let cursor = Math.max(0, Number(opts.startAtSec) || 0);
    return hits2.map((hit, index) => {
      const timing = aeLayerTiming(hit, cursor);
      const durationSec = timing.durationSec != null ? timing.durationSec : Math.max(0, msToSeconds((hit.endMs ?? 0) - (hit.startMs ?? 0))) || 1;
      const plan = {
        index,
        hitId: hit.id,
        compTimeSec: cursor,
        ...timing
      };
      if (sequential) cursor += durationSec + gapSec;
      return plan;
    });
  }

  // src/aftereffects.js
  function getExtendScriptApp() {
    try {
      if (typeof app !== "undefined" && app?.project) return app;
    } catch {
    }
    return null;
  }
  async function getAeUxpModule() {
    for (const id of ["aeft", "aftereffects"]) {
      try {
        return await loadNativeModule(id);
      } catch {
      }
    }
    return null;
  }
  function findCompByName(project, name) {
    const want = String(name || "").trim();
    if (!want) return null;
    for (let i = 1; i <= project.numItems; i += 1) {
      const item = project.item(i);
      if (item && item instanceof CompItem && item.name === want) return item;
    }
    return null;
  }
  function findFootageByPath(project, filePath) {
    const base2 = pathBasename(filePath);
    for (let i = 1; i <= project.numItems; i += 1) {
      const item = project.item(i);
      if (!(item instanceof FootageItem)) continue;
      try {
        const main = item.mainSource;
        if (main instanceof FileSource && main.file) {
          const full = String(main.file.fsName || main.file.fullName || "");
          if (full === filePath || full.endsWith(base2)) return item;
        }
      } catch {
      }
      if (item.name === base2) return item;
    }
    return null;
  }
  function importFootage(project, filePath) {
    const existing = findFootageByPath(project, filePath);
    if (existing) return existing;
    const file = new File(filePath);
    if (!file.exists) throw new Error(`Datei nicht gefunden: ${filePath}`);
    return project.importFile(new ImportOptions(file));
  }
  function getOrCreateComp(project, compName, fps) {
    const name = String(compName || "VIDEON").trim() || "VIDEON";
    const existing = findCompByName(project, name);
    if (existing) return existing;
    const rate = Number(fps) > 0 ? Number(fps) : 25;
    return project.items.addComp(name, 1920, 1080, 1, rate, 10);
  }
  function applyLayerTiming(layer, timing) {
    layer.startTime = timing.startTime;
    layer.inPoint = timing.inPoint;
    if (timing.outPoint != null) layer.outPoint = timing.outPoint;
  }
  async function insertHitIntoAfterEffects(input) {
    const localPath = assertLocalImportPath(input.filePath);
    const fps = Number(input.fps) > 0 ? Number(input.fps) : 25;
    const plan = planAeInserts([input.hit], {
      sequential: input.sequential !== false,
      gapFrames: input.gapFrames,
      fps,
      startAtSec: input.startAtSec
    })[0];
    const timing = aeLayerTiming(input.hit, plan.compTimeSec);
    const allowPlan = input.allowPlan === true;
    const esApp = getExtendScriptApp();
    if (esApp?.project) {
      try {
        const project = esApp.project;
        const comp = getOrCreateComp(project, input.compName, fps);
        const footage = importFootage(project, localPath);
        if (!footage) throw new Error("Footage-Import fehlgeschlagen");
        const layer = comp.layers.add(footage);
        applyLayerTiming(layer, timing);
        return {
          ok: true,
          mode: "extendscript",
          message: `AE: \u201E${input.hit.mediaFilename || pathBasename(localPath)}\u201C \u2192 Comp \u201E${comp.name}\u201C`,
          plan
        };
      } catch (error) {
        return {
          ok: false,
          mode: "extendscript",
          message: error instanceof Error ? error.message : String(error),
          plan
        };
      }
    }
    const uxp = await getAeUxpModule();
    if (uxp && !uxp.__videonStub) {
      return {
        ok: false,
        mode: "uxp-pending",
        message: "AE UXP DOM-APIs noch nicht \xF6ffentlich \u2014 Placement geplant; ExtendScript-Host oder sp\xE4tere Adobe-API n\xF6tig",
        plan,
        sourceWindow: sceneSourceWindowSec(input.hit),
        filePath: localPath
      };
    }
    const planMessage = `AE-Plan: ${localPath} \u2192 Comp \u201E${input.compName || "VIDEON"}\u201C @ ${plan.compTimeSec.toFixed(2)}s`;
    if (allowPlan) {
      return { ok: true, mode: "plan", message: planMessage, plan, filePath: localPath };
    }
    return {
      ok: false,
      mode: "unsupported",
      message: "After Effects Insert braucht ExtendScript `app.project` oder k\xFCnftige AE UXP DOM-APIs. Placement wurde berechnet, aber nicht eingef\xFCgt.",
      plan,
      filePath: localPath
    };
  }

  // src/settings.js
  function normalizeProductBaseUrl(value) {
    const trimmed = String(value || "").trim().replace(/\/$/, "");
    if (!trimmed) return { ok: false, error: "Product Base URL fehlt" };
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { ok: false, error: "URL muss http(s) sein" };
      }
      return { ok: true, value: `${url.origin}${url.pathname}`.replace(/\/$/, "") };
    } catch {
      return { ok: false, error: "Ung\xFCltige Product Base URL" };
    }
  }
  function looksLikeApiToken(token) {
    const t = String(token || "").trim();
    return t.startsWith("videon_") && t.length > 20;
  }

  // src/api.js
  var STORAGE_KEY = "videon.adobe.settings";
  var LAST_QUERY_KEY = "videon.adobe.lastQuery";
  var DEFAULTS = {
    productBaseUrl: "https://videon.projects-a.plygrnd.tech",
    apiToken: "",
    defaultPlatformProjectId: "",
    binName: "VIDEON",
    compName: "VIDEON",
    aeSequential: true,
    aeGapFrames: 0
  };
  function loadSettings() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
    } catch {
      return { ...DEFAULTS };
    }
  }
  function saveSettings(partial) {
    const next = { ...loadSettings(), ...partial };
    if (partial.productBaseUrl != null) {
      const normalized = normalizeProductBaseUrl(partial.productBaseUrl);
      if (normalized.ok) next.productBaseUrl = normalized.value;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }
  function loadLastQuery() {
    try {
      return localStorage.getItem(LAST_QUERY_KEY) || "";
    } catch {
      return "";
    }
  }
  function saveLastQuery(query) {
    try {
      localStorage.setItem(LAST_QUERY_KEY, String(query || ""));
    } catch {
    }
  }
  function authHeaders(token) {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  function base(settings) {
    return String(settings.productBaseUrl || "").replace(/\/$/, "");
  }
  async function parseError(response) {
    try {
      const body = await response.json();
      const msg = body?.error?.message || body?.message;
      const code = body?.error?.code;
      return code ? `${code}: ${msg || response.statusText}` : msg || `${response.status} ${response.statusText}`;
    } catch {
      return `${response.status} ${response.statusText}`;
    }
  }
  async function testHealth(settings, signal) {
    const response = await fetch(`${base(settings)}/api/health`, {
      headers: authHeaders(settings.apiToken),
      signal
    });
    return response.ok;
  }
  async function listCollections(settings, signal) {
    const response = await fetch(`${base(settings)}/api/collections`, {
      headers: authHeaders(settings.apiToken),
      signal
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }
  async function searchMedia(settings, query, limit = 40, signal) {
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(Math.max(limit, 1), 40))
    });
    if (settings.defaultPlatformProjectId) {
      params.set("platformProjectId", settings.defaultPlatformProjectId);
    }
    const response = await fetch(`${base(settings)}/api/media/search?${params}`, {
      headers: authHeaders(settings.apiToken),
      signal
    });
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }
  function frameUrl(settings, hit, width = 240) {
    const t = hit.startMs != null && hit.startMs >= 0 ? Math.floor(hit.startMs) : 1e3;
    const params = new URLSearchParams({
      platformProjectId: hit.platformProjectId,
      t: String(t),
      w: String(width)
    });
    return `${base(settings)}/api/media/${encodeURIComponent(hit.mediaAssetId)}/frame?${params}`;
  }
  async function fetchFrameBlob(settings, hit, signal) {
    const response = await fetch(frameUrl(settings, hit), {
      headers: authHeaders(settings.apiToken),
      signal
    });
    if (!response.ok) return null;
    return response.blob();
  }
  async function requestAdobeDownload(settings, hit, signal) {
    if (!hit.platformProjectId) {
      throw new Error("platformProjectId is required for download");
    }
    const params = new URLSearchParams({
      platformProjectId: hit.platformProjectId,
      kind: "source",
      mode: "json"
    });
    const response = await fetch(
      `${base(settings)}/api/media/${encodeURIComponent(hit.mediaAssetId)}/adobe-download?${params}`,
      { headers: authHeaders(settings.apiToken), signal }
    );
    if (!response.ok) throw new Error(await parseError(response));
    return response.json();
  }
  function absoluteProductHref(settings, href) {
    if (!href) return null;
    if (/^https?:\/\//i.test(href)) return href;
    return `${base(settings)}${href.startsWith("/") ? "" : "/"}${href}`;
  }

  // src/cache-index.js
  var DEFAULT_MAX_CACHE_BYTES = 5 * 1024 * 1024 * 1024;
  var DEFAULT_MAX_CACHE_ENTRIES = 80;
  function emptyCacheIndex() {
    return (
      /** @type {CacheIndex} */
      {}
    );
  }
  function parseCacheIndex(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyCacheIndex();
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!key || !value || typeof value !== "object") continue;
      out[key] = {
        path: typeof value.path === "string" ? value.path : void 0,
        fileName: typeof value.fileName === "string" ? value.fileName : void 0,
        at: Number.isFinite(Number(value.at)) ? Number(value.at) : 0,
        bytes: Number.isFinite(Number(value.bytes)) ? Number(value.bytes) : 0
      };
    }
    return out;
  }
  function cacheStats(index) {
    const entries = Object.entries(index || {});
    let bytes = 0;
    for (const [, entry] of entries) bytes += Number(entry.bytes) || 0;
    return { count: entries.length, bytes };
  }
  function formatCacheBytes(bytes) {
    const n = Math.max(0, Number(bytes) || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  function pickEvictionKeys(index, options = {}) {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_CACHE_BYTES;
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    const incomingBytes = Math.max(0, Number(options.incomingBytes) || 0);
    const keepKey = options.keepKey || null;
    const entries = Object.entries(index || {}).filter(([key]) => key !== keepKey);
    entries.sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    let bytes = entries.reduce((sum, [, e]) => sum + (Number(e.bytes) || 0), 0) + incomingBytes;
    let count = entries.length + (keepKey && index?.[keepKey] ? 0 : 1);
    const evict = [];
    for (const [key, entry] of entries) {
      if (count <= maxEntries && bytes <= maxBytes) break;
      evict.push(key);
      bytes -= Number(entry.bytes) || 0;
      count -= 1;
    }
    return evict;
  }
  function removeKeysFromIndex(index, keys) {
    const next = { ...index };
    for (const key of keys) delete next[key];
    return next;
  }

  // src/cache.js
  var META_KEY = "videon.adobe.cacheIndex";
  var POSTER_META_KEY = "videon.adobe.posterIndex";
  function readIndex() {
    try {
      return parseCacheIndex(JSON.parse(localStorage.getItem(META_KEY) || "{}"));
    } catch {
      return parseCacheIndex({});
    }
  }
  function writeIndex(index) {
    localStorage.setItem(META_KEY, JSON.stringify(index));
  }
  function readPosterIndex() {
    try {
      return parseCacheIndex(JSON.parse(localStorage.getItem(POSTER_META_KEY) || "{}"));
    } catch {
      return parseCacheIndex({});
    }
  }
  function writePosterIndex(index) {
    localStorage.setItem(POSTER_META_KEY, JSON.stringify(index));
  }
  function sanitizeFilename(name) {
    const base2 = String(name || "clip.mp4").replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
    return base2.includes(".") ? base2 : `${base2}.mp4`;
  }
  function cacheFileName(cacheKey, filename) {
    return `${String(cacheKey).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80)}_${sanitizeFilename(filename)}`;
  }
  async function getUxpFs() {
    const uxp = await loadNativeModule("uxp");
    const fs = uxp.storage?.localFileSystem;
    if (!fs?.getDataFolder) {
      throw new Error("UXP localFileSystem nicht verf\xFCgbar \u2014 Cache unm\xF6glich");
    }
    return { uxp, fs };
  }
  async function getDataFolder() {
    const { fs } = await getUxpFs();
    return fs.getDataFolder();
  }
  async function findEntryByName(folder, fileName) {
    if (!fileName || typeof folder.getEntries !== "function") return null;
    try {
      const entries = await folder.getEntries();
      return entries.find((entry) => entry?.name === fileName && !entry.isFolder) || null;
    } catch {
      return null;
    }
  }
  async function deleteEntrySafe(entry) {
    if (!entry) return;
    try {
      if (typeof entry.delete === "function") await entry.delete();
    } catch {
    }
  }
  async function resolveCachedPath(cacheKey) {
    const index = readIndex();
    const entry = index[cacheKey];
    if (!entry) return null;
    if (entry.path && isHttpUrl(entry.path)) {
      writeIndex(removeKeysFromIndex(index, [cacheKey]));
      return null;
    }
    try {
      const folder = await getDataFolder();
      const fileName = entry.fileName || (entry.path ? entry.path.split(/[/\\]/).pop() : null);
      if (!fileName) {
        writeIndex(removeKeysFromIndex(index, [cacheKey]));
        return null;
      }
      const file = await findEntryByName(folder, fileName);
      if (!file?.nativePath || isHttpUrl(file.nativePath)) {
        writeIndex(removeKeysFromIndex(index, [cacheKey]));
        return null;
      }
      index[cacheKey] = {
        ...entry,
        fileName,
        path: file.nativePath,
        at: Date.now(),
        bytes: entry.bytes || 0
      };
      writeIndex(index);
      return file.nativePath;
    } catch {
      return null;
    }
  }
  function getCacheStats() {
    return cacheStats(readIndex());
  }
  async function evictIfNeeded(index, keepKey, incomingBytes) {
    const keys = pickEvictionKeys(index, {
      keepKey,
      incomingBytes,
      maxBytes: DEFAULT_MAX_CACHE_BYTES,
      maxEntries: DEFAULT_MAX_CACHE_ENTRIES
    });
    if (!keys.length) return index;
    try {
      const folder = await getDataFolder();
      for (const key of keys) {
        const entry = index[key];
        const name = entry?.fileName;
        if (name) {
          const file = await findEntryByName(folder, name);
          await deleteEntrySafe(file);
        }
      }
    } catch {
    }
    return removeKeysFromIndex(index, keys);
  }
  async function materializeDownload(input) {
    const { cacheKey, downloadUrl, filename } = input;
    if (!downloadUrl) throw new Error("downloadUrl fehlt");
    if (!cacheKey) throw new Error("cacheKey fehlt");
    const existing = await resolveCachedPath(cacheKey);
    if (existing) return existing;
    const { uxp } = await getUxpFs();
    const folder = await getDataFolder();
    const fileName = cacheFileName(cacheKey, filename);
    const file = await folder.createFile(fileName, { overwrite: true });
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Download fehlgeschlagen: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) throw new Error("Download leer");
    await file.write(buffer, { format: uxp.storage.formats.binary });
    const nativePath = file.nativePath;
    if (!nativePath || isHttpUrl(nativePath)) {
      throw new Error("Kein nativer Dateipfad nach Cache-Write \u2014 Premiere-Import blockiert");
    }
    let index = await evictIfNeeded(readIndex(), cacheKey, buffer.byteLength);
    index[cacheKey] = {
      path: nativePath,
      fileName,
      at: Date.now(),
      bytes: buffer.byteLength
    };
    writeIndex(index);
    return nativePath;
  }
  function posterCacheKey(hit, width = 240) {
    const t = hit.startMs != null && hit.startMs >= 0 ? Math.floor(hit.startMs) : 1e3;
    return `${hit.mediaAssetId}:poster:w${width}:t${t}`;
  }
  async function readCachedPosterBlob(cacheKey) {
    const index = readPosterIndex();
    const entry = index[cacheKey];
    if (!entry?.fileName) return null;
    try {
      const { uxp } = await getUxpFs();
      const folder = await getDataFolder();
      const file = await findEntryByName(folder, entry.fileName);
      if (!file || typeof file.read !== "function") return null;
      const data = await file.read({ format: uxp.storage.formats.binary });
      if (!data || data.byteLength != null && data.byteLength === 0) return null;
      index[cacheKey] = { ...entry, at: Date.now() };
      writePosterIndex(index);
      return new Blob([data], { type: "image/jpeg" });
    } catch {
      return null;
    }
  }
  async function materializePoster(input) {
    const { cacheKey, blob, filename } = input;
    if (!cacheKey || !blob) return null;
    const index = readPosterIndex();
    const existing = index[cacheKey];
    if (existing?.fileName) {
      try {
        const folder = await getDataFolder();
        const file = await findEntryByName(folder, existing.fileName);
        if (file?.nativePath && !isHttpUrl(file.nativePath)) {
          index[cacheKey] = { ...existing, at: Date.now() };
          writePosterIndex(index);
          return file.nativePath;
        }
      } catch {
      }
    }
    try {
      const { uxp } = await getUxpFs();
      const folder = await getDataFolder();
      const fileName = cacheFileName(cacheKey, filename || "poster.jpg");
      const file = await folder.createFile(fileName, { overwrite: true });
      const buffer = await blob.arrayBuffer();
      await file.write(buffer, { format: uxp.storage.formats.binary });
      if (!file.nativePath || isHttpUrl(file.nativePath)) return null;
      index[cacheKey] = {
        path: file.nativePath,
        fileName,
        at: Date.now(),
        bytes: buffer.byteLength
      };
      writePosterIndex(index);
      return file.nativePath;
    } catch {
      return null;
    }
  }
  async function clearCache() {
    const media = readIndex();
    const posters = readPosterIndex();
    let deleted = 0;
    try {
      const folder = await getDataFolder();
      for (const entry of [...Object.values(media), ...Object.values(posters)]) {
        if (!entry?.fileName) continue;
        const file = await findEntryByName(folder, entry.fileName);
        if (file) {
          await deleteEntrySafe(file);
          deleted += 1;
        }
      }
    } catch {
    }
    writeIndex({});
    writePosterIndex({});
    return { deleted, ...cacheStats({}) };
  }
  async function refreshCacheStats() {
    const index = readIndex();
    const folder = await getDataFolder().catch(() => null);
    if (!folder) return cacheStats(index);
    let next = { ...index };
    for (const [key, entry] of Object.entries(index)) {
      const name = entry.fileName;
      if (!name) {
        next = removeKeysFromIndex(next, [key]);
        continue;
      }
      const file = await findEntryByName(folder, name);
      if (!file) next = removeKeysFromIndex(next, [key]);
    }
    writeIndex(next);
    return cacheStats(next);
  }

  // src/collections.js
  function normalizeCollections(payload) {
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
    const out = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!id || !name) continue;
      out.push({
        id,
        name,
        status: typeof item.status === "string" ? item.status : "active"
      });
    }
    return out;
  }

  // src/hit-model.js
  function formatSceneHitClock(ms) {
    const total = Math.max(0, Math.floor(ms / 1e3));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function sceneHitTimingLabel(hit) {
    if (hit.startMs != null && hit.endMs != null) {
      return `${formatSceneHitClock(hit.startMs)}\u2013${formatSceneHitClock(hit.endMs)}`;
    }
    if (hit.startMs != null) return formatSceneHitClock(hit.startMs);
    return null;
  }
  function sceneHitDurationLabel(hit) {
    if (hit.startMs == null || hit.endMs == null || hit.endMs < hit.startMs) return null;
    return formatSceneHitClock(hit.endMs - hit.startMs);
  }
  function formatRank(rank) {
    const n = Number(rank);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n.toFixed(2);
  }
  function buildHitHref(hit) {
    if (!hit?.mediaAssetId || !hit?.platformProjectId) return null;
    const params = new URLSearchParams({ platformProjectId: hit.platformProjectId });
    if (hit.startMs != null && hit.startMs >= 0) params.set("t", String(Math.floor(hit.startMs)));
    if (hit.sceneKey?.trim()) params.set("scene", hit.sceneKey.trim());
    return `/media/${encodeURIComponent(hit.mediaAssetId)}?${params.toString()}`;
  }
  function normalizeSearchHit(raw) {
    const mediaAssetId = String(raw.mediaAssetId || "");
    const platformProjectId = String(raw.platformProjectId || "");
    const startMs = raw.startMs == null ? null : Number(raw.startMs);
    const endMs = raw.endMs == null ? null : Number(raw.endMs);
    const sceneKey = raw.sceneKey == null ? null : String(raw.sceneKey);
    const rank = raw.rank == null ? null : Number(raw.rank);
    const hit = {
      id: String(raw.id || `${mediaAssetId}:${sceneKey || "asset"}`),
      mediaAssetId,
      platformProjectId,
      sceneKey,
      mediaFilename: String(raw.mediaFilename || raw.filename || "Untitled"),
      startMs: Number.isFinite(startMs) ? startMs : null,
      endMs: Number.isFinite(endMs) ? endMs : null,
      searchText: String(raw.searchText || "").slice(0, 400),
      projectName: raw.projectName == null ? null : String(raw.projectName),
      rank: Number.isFinite(rank) ? rank : null,
      href: raw.href ? String(raw.href) : null
    };
    if (!hit.href) hit.href = buildHitHref(hit);
    return hit;
  }
  function dedupeSearchHits(hits2) {
    const byKey = /* @__PURE__ */ new Map();
    for (const hit of hits2) {
      if (!hit?.mediaAssetId) continue;
      const key = `${hit.mediaAssetId}::${hit.sceneKey || ""}::${hit.startMs ?? ""}::${hit.endMs ?? ""}`;
      const prev = byKey.get(key);
      if (!prev || (hit.rank ?? 0) > (prev.rank ?? 0)) byKey.set(key, hit);
    }
    return [...byKey.values()];
  }

  // src/host.js
  async function detectHostApp() {
    try {
      const uxp = await loadNativeModule("uxp");
      const name = String(uxp?.host?.name || uxp?.host?.app || "").toLowerCase();
      if (name.includes("after") || name === "aeft" || name === "ae") {
        return { id: "AEFT", source: uxp?.host?.__videonPreview ? "preview" : "uxp" };
      }
      if (name.includes("premiere") || name === "ppro" || name === "premierepro") {
        return { id: "PPRO", source: "uxp" };
      }
      if (name === "aeft") return { id: "AEFT", source: "preview" };
    } catch {
    }
    try {
      if (typeof location !== "undefined") {
        const q = new URLSearchParams(location.search).get("host");
        if (q && /aeft|aftereffects|^ae$/i.test(q)) {
          return { id: "AEFT", source: "preview" };
        }
      }
    } catch {
    }
    return { id: "PPRO", source: "default" };
  }
  function isAfterEffectsHost(host) {
    return host === "AEFT" || host?.id === "AEFT";
  }

  // src/time.js
  function msToFrames(ms, fps) {
    const rate = Number(fps);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return Math.round(Math.max(0, Number(ms) || 0) / 1e3 * rate);
  }
  function sceneInOutFrames(hit, fps) {
    if (hit.startMs == null || hit.endMs == null || hit.endMs <= hit.startMs) {
      return null;
    }
    return {
      inPoint: msToFrames(hit.startMs, fps),
      outPoint: msToFrames(hit.endMs, fps)
    };
  }

  // src/premiere.js
  async function getPremiereApi() {
    try {
      return await loadNativeModule("premierepro");
    } catch {
      return null;
    }
  }
  function runLockedTransaction(project, name, build) {
    let ok = false;
    project.lockedAccess(() => {
      ok = project.executeTransaction((compoundAction) => {
        build(compoundAction);
      }, name);
    });
    return ok;
  }
  async function listFolderItems(folder) {
    if (!folder || typeof folder.getItems !== "function") return [];
    return await folder.getItems() || [];
  }
  async function findBinByName(ppro, root, binName) {
    const want = String(binName || "VIDEON").trim() || "VIDEON";
    const queue = [root];
    while (queue.length) {
      const folder = queue.shift();
      const items = await listFolderItems(folder);
      for (const item of items) {
        if (item?.name === want) {
          const asFolder = ppro.FolderItem?.cast?.(item) || item;
          if (asFolder && typeof asFolder.getItems === "function") return asFolder;
        }
        const nested = ppro.FolderItem?.cast?.(item);
        if (nested) queue.push(nested);
      }
    }
    return null;
  }
  async function ensureBin(ppro, project, binName) {
    const root = await project.getRootItem();
    if (!root) throw new Error("Projekt-Root nicht verf\xFCgbar");
    const existing = await findBinByName(ppro, root, binName);
    if (existing) return existing;
    const name = String(binName || "VIDEON").trim() || "VIDEON";
    if (typeof root.createBinAction !== "function") {
      return root;
    }
    runLockedTransaction(project, `VIDEON: Bin \u201E${name}\u201C`, (compoundAction) => {
      compoundAction.addAction(root.createBinAction(name, false));
    });
    const created = await findBinByName(ppro, root, name);
    return created || root;
  }
  async function walkProjectItems(ppro, root) {
    const out = [];
    const queue = [root];
    while (queue.length) {
      const folder = queue.shift();
      const items = await listFolderItems(folder);
      for (const item of items) {
        out.push(item);
        const nested = ppro.FolderItem?.cast?.(item);
        if (nested) queue.push(nested);
      }
    }
    return out;
  }
  async function findClipMatchingPath(ppro, project, filePath) {
    const root = await project.getRootItem();
    const items = await walkProjectItems(ppro, root);
    const base2 = pathBasename(filePath);
    for (const item of items) {
      const clip = ppro.ClipProjectItem?.cast?.(item);
      if (!clip) continue;
      let mediaPath = null;
      try {
        mediaPath = typeof clip.getMediaFilePath === "function" ? await clip.getMediaFilePath() : null;
      } catch {
        mediaPath = null;
      }
      if (mediaPath && pathsLikelyMatch(mediaPath, filePath)) return clip;
      if (!mediaPath && item.name && item.name === base2) return clip;
    }
    for (const item of items) {
      const clip = ppro.ClipProjectItem?.cast?.(item);
      if (!clip || typeof clip.findItemsMatchingMediaPath !== "function") continue;
      try {
        const matches = await clip.findItemsMatchingMediaPath(filePath, true);
        if (Array.isArray(matches) && matches.length) {
          return ppro.ClipProjectItem.cast(matches[0]) || matches[0];
        }
        const byName = await clip.findItemsMatchingMediaPath(base2, true);
        if (Array.isArray(byName) && byName.length) {
          return ppro.ClipProjectItem.cast(byName[0]) || byName[0];
        }
      } catch {
      }
    }
    return null;
  }
  function secondsFromMs(ms) {
    return Math.max(0, Number(ms) || 0) / 1e3;
  }
  async function applySceneInOut(ppro, project, clip, hit) {
    if (!clip || typeof clip.createSetInOutPointsAction !== "function") {
      return { applied: false, reason: "createSetInOutPointsAction unavailable" };
    }
    if (hit.startMs == null || hit.endMs == null || hit.endMs <= hit.startMs) {
      return { applied: false, reason: "no scene bounds" };
    }
    const inPoint = ppro.TickTime.createWithSeconds(secondsFromMs(hit.startMs));
    const outPoint = ppro.TickTime.createWithSeconds(secondsFromMs(hit.endMs));
    const ok = runLockedTransaction(project, "VIDEON: Scene In/Out", (compoundAction) => {
      compoundAction.addAction(clip.createSetInOutPointsAction(inPoint, outPoint));
    });
    return { applied: Boolean(ok), reason: ok ? null : "transaction failed" };
  }
  async function resolveInsertTime(ppro, sequence) {
    try {
      if (typeof sequence.getPlayerPosition === "function") {
        const pos = await sequence.getPlayerPosition();
        if (pos) return pos;
      }
    } catch {
    }
    return ppro.TickTime?.TIME_ZERO || ppro.TickTime.createWithSeconds(0);
  }
  async function appendClipToActiveSequence(ppro, project, clipProjectItem) {
    const sequence = await project.getActiveSequence();
    if (!sequence) {
      return { ok: false, message: "Keine aktive Sequence" };
    }
    if (!ppro.SequenceEditor?.getEditor) {
      return { ok: false, message: "SequenceEditor API fehlt" };
    }
    const editor = ppro.SequenceEditor.getEditor(sequence);
    const at = await resolveInsertTime(ppro, sequence);
    const ok = runLockedTransaction(project, "VIDEON: Sequence Insert", (compoundAction) => {
      const action = editor.createInsertProjectItemAction(
        clipProjectItem,
        at,
        0,
        // V1
        0,
        // A1
        true
        // limitShift
      );
      compoundAction.addAction(action);
    });
    return {
      ok: Boolean(ok),
      message: ok ? "Auf Sequence eingef\xFCgt" : "Sequence-Insert fehlgeschlagen"
    };
  }
  async function insertHitIntoPremiere(input) {
    const { filePath, binName, hit, appendToSequence } = input;
    const localPath = assertLocalImportPath(filePath);
    const ppro = await getPremiereApi();
    if (!ppro) {
      console.info("[VIDEON] premierepro module unavailable; would import", {
        filePath: localPath,
        binName,
        hitId: hit.id,
        appendToSequence,
        inOut: sceneInOutFrames(hit, 25)
      });
      return {
        ok: true,
        mode: "stub",
        message: `Host-API nicht verf\xFCgbar \u2014 Datei bereit: ${localPath}`
      };
    }
    try {
      const project = await ppro.Project.getActiveProject();
      if (!project) throw new Error("Kein aktives Premiere-Projekt");
      if (typeof project.importFiles !== "function") {
        throw new Error("importFiles fehlt \u2014 Premiere UXP \u2265 25.6 n\xF6tig");
      }
      const bin = await ensureBin(ppro, project, binName || "VIDEON");
      const targetBin = bin || null;
      const imported = await project.importFiles([localPath], true, targetBin, false);
      if (imported === false) {
        throw new Error("importFiles hat false zur\xFCckgegeben");
      }
      let clip = await findClipMatchingPath(ppro, project, localPath);
      if (!clip) {
        await new Promise((r) => setTimeout(r, 150));
        clip = await findClipMatchingPath(ppro, project, localPath);
      }
      if (!clip) {
        return {
          ok: true,
          mode: "imported-unresolved",
          message: `Importiert, Clip nicht aufl\xF6sbar \u2014 pr\xFCfe Bin \u201E${binName || "VIDEON"}\u201C`
        };
      }
      const inOut = await applySceneInOut(ppro, project, clip, hit);
      let sequenceNote = "";
      if (appendToSequence) {
        const seq = await appendClipToActiveSequence(ppro, project, clip);
        sequenceNote = seq.ok ? `; ${seq.message}` : `; Sequence: ${seq.message}`;
      }
      const timing = inOut.applied && hit.startMs != null && hit.endMs != null ? ` (${secondsFromMs(hit.startMs).toFixed(2)}s\u2013${secondsFromMs(hit.endMs).toFixed(2)}s)` : "";
      return {
        ok: true,
        mode: "imported",
        message: `Importiert in \u201E${binName || "VIDEON"}\u201C${timing}${sequenceNote}`
      };
    } catch (error) {
      return {
        ok: false,
        mode: "error",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // src/index.js
  var PANEL_VERSION = "0.1.10";
  var els = {};
  function queryEls() {
    return {
      panelVersion: document.getElementById("panel-version"),
      settingsToggle: document.getElementById("settings-toggle"),
      settingsPanel: document.getElementById("settings-panel"),
      productBaseUrl: document.getElementById("product-base-url"),
      apiToken: document.getElementById("api-token"),
      collectionSelect: document.getElementById("collection-select"),
      collectionSelectMain: document.getElementById("collection-select-main"),
      defaultProjectId: document.getElementById("default-project-id"),
      binName: document.getElementById("bin-name"),
      compName: document.getElementById("comp-name"),
      premiereBinLabel: document.getElementById("premiere-bin-label"),
      aeCompLabel: document.getElementById("ae-comp-label"),
      settingsSave: document.getElementById("settings-save"),
      testConnection: document.getElementById("test-connection"),
      reloadCollections: document.getElementById("reload-collections"),
      cacheStats: document.getElementById("cache-stats"),
      cacheRefresh: document.getElementById("cache-refresh"),
      cacheClear: document.getElementById("cache-clear"),
      settingsStatus: document.getElementById("settings-status"),
      bootStatus: document.getElementById("boot-status"),
      searchInput: document.getElementById("search-input"),
      searchBtn: document.getElementById("search-btn"),
      banner: document.getElementById("banner"),
      resultsList: document.getElementById("results-list"),
      resultsCount: document.getElementById("results-count"),
      selectAllBtn: document.getElementById("select-all-btn"),
      selectNoneBtn: document.getElementById("select-none-btn"),
      insertBar: document.getElementById("insert-bar"),
      hostBadge: document.getElementById("host-badge"),
      premiereInsertOpts: document.getElementById("premiere-insert-opts"),
      aeInsertOpts: document.getElementById("ae-insert-opts"),
      appendSequence: document.getElementById("append-sequence"),
      aeSequential: document.getElementById("ae-sequential"),
      aeGapFrames: document.getElementById("ae-gap-frames"),
      dryRunBtn: document.getElementById("dry-run-btn"),
      insertBtn: document.getElementById("insert-btn"),
      selectedCount: document.getElementById("selected-count"),
      progress: document.getElementById("progress"),
      progressBar: document.getElementById("progress-bar")
    };
  }
  var REQUIRED_EL_IDS = [
    "settings-toggle",
    "settings-panel",
    "settings-save",
    "test-connection",
    "settings-status",
    "product-base-url",
    "api-token",
    "search-input",
    "search-btn"
  ];
  function missingRequiredEls() {
    return REQUIRED_EL_IDS.filter((id) => !document.getElementById(id));
  }
  var hits = [];
  var selected = /* @__PURE__ */ new Set();
  var blobUrls = [];
  var collections = [];
  var searchAbort = null;
  var hostInfo = { id: "PPRO", source: "default" };
  var aeCursorSec = 0;
  function showBanner(message, tone = "") {
    els.banner.hidden = !message;
    els.banner.textContent = message || "";
    els.banner.className = `banner${tone ? ` ${tone}` : ""}`;
  }
  function applyHostChrome() {
    const ae = isAfterEffectsHost(hostInfo);
    els.premiereBinLabel?.classList.toggle("hidden", ae);
    els.aeCompLabel?.classList.toggle("hidden", !ae);
    els.premiereInsertOpts?.classList.toggle("hidden", ae);
    els.aeInsertOpts?.classList.toggle("hidden", !ae);
    if (els.hostBadge) {
      els.hostBadge.hidden = false;
      els.hostBadge.textContent = ae ? `Host: After Effects (${hostInfo.source})` : `Host: Premiere Pro (${hostInfo.source})`;
    }
  }
  function updateCacheStatsLabel(stats) {
    if (!els.cacheStats) return;
    const s = stats || getCacheStats();
    els.cacheStats.textContent = `${s.count} Datei(en) \xB7 ${formatCacheBytes(s.bytes)}`;
  }
  async function refreshCacheUi(showStatus = false) {
    try {
      const stats = await refreshCacheStats();
      updateCacheStatsLabel(stats);
      if (showStatus) {
        els.settingsStatus.hidden = false;
        els.settingsStatus.textContent = `Cache: ${stats.count} \xB7 ${formatCacheBytes(stats.bytes)}`;
      }
    } catch (error) {
      updateCacheStatsLabel(getCacheStats());
      if (showStatus) {
        els.settingsStatus.hidden = false;
        els.settingsStatus.textContent = error instanceof Error ? error.message : String(error);
      }
    }
  }
  async function loadPosterForHit(settings, hit, signal) {
    const key = posterCacheKey(hit);
    try {
      const cached = await readCachedPosterBlob(key);
      if (cached) return cached;
    } catch {
    }
    const blob = await fetchFrameBlob(settings, hit, signal);
    if (!blob) return null;
    void materializePoster({ cacheKey: key, blob, filename: "poster.jpg" });
    return blob;
  }
  function revokeBlobs() {
    while (blobUrls.length) {
      const url = blobUrls.pop();
      try {
        URL.revokeObjectURL(url);
      } catch {
      }
    }
  }
  async function openExternal(href) {
    try {
      const uxp = await loadNativeModule("uxp");
      if (uxp?.shell?.openExternal) {
        await uxp.shell.openExternal(href);
        return;
      }
    } catch {
    }
    try {
      window.open(href, "_blank");
    } catch {
      showBanner(href, "ok");
    }
  }
  function fillCollectionSelect(select, selectedId) {
    if (!select) return;
    const current = selectedId || "";
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "\u2014 alle zug\xE4nglichen \u2014";
    select.append(all);
    for (const item of collections) {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.status && item.status !== "active" ? `${item.name} (${item.status})` : item.name;
      select.append(opt);
    }
    select.value = collections.some((c) => c.id === current) ? current : "";
  }
  function syncCollectionUi(selectedId) {
    fillCollectionSelect(els.collectionSelect, selectedId);
    fillCollectionSelect(els.collectionSelectMain, selectedId);
    if (els.defaultProjectId) els.defaultProjectId.value = selectedId || "";
  }
  function applySettingsToForm(settings) {
    els.productBaseUrl.value = settings.productBaseUrl || "";
    els.apiToken.value = settings.apiToken || "";
    if (els.binName) els.binName.value = settings.binName || "VIDEON";
    if (els.compName) els.compName.value = settings.compName || "VIDEON";
    if (els.aeSequential) els.aeSequential.checked = settings.aeSequential !== false;
    if (els.aeGapFrames) els.aeGapFrames.value = String(settings.aeGapFrames ?? 0);
    syncCollectionUi(settings.defaultPlatformProjectId || "");
  }
  function readFormSettings() {
    const fromSelect = els.collectionSelectMain?.value?.trim() || els.collectionSelect?.value?.trim() || els.defaultProjectId.value.trim();
    return {
      productBaseUrl: els.productBaseUrl.value.trim(),
      apiToken: els.apiToken.value.trim(),
      defaultPlatformProjectId: fromSelect,
      binName: els.binName?.value.trim() || "VIDEON",
      compName: els.compName?.value.trim() || "VIDEON",
      aeSequential: els.aeSequential ? els.aeSequential.checked : true,
      aeGapFrames: els.aeGapFrames ? Math.max(0, Number(els.aeGapFrames.value) || 0) : 0
    };
  }
  function onCollectionChange(event) {
    const id = event.target.value;
    if (els.collectionSelect) els.collectionSelect.value = id;
    if (els.collectionSelectMain) els.collectionSelectMain.value = id;
    if (els.defaultProjectId) els.defaultProjectId.value = id;
    saveSettings({ defaultPlatformProjectId: id });
  }
  function updateSelectionChrome() {
    els.selectedCount.textContent = String(selected.size);
    els.insertBar.classList.toggle("hidden", selected.size === 0);
    const hasHits = hits.length > 0;
    els.selectAllBtn.hidden = !hasHits;
    els.selectNoneBtn.hidden = !hasHits;
  }
  function setBusy(busy) {
    els.searchBtn.disabled = busy;
    els.dryRunBtn.disabled = busy;
    els.insertBtn.disabled = busy;
  }
  async function refreshCollections(showStatus = true) {
    const settings = saveSettings(readFormSettings());
    if (!settings.apiToken) {
      if (showStatus) {
        els.settingsStatus.hidden = false;
        els.settingsStatus.textContent = "Token setzen, dann Collections laden.";
      }
      return;
    }
    if (showStatus) {
      els.settingsStatus.hidden = false;
      els.settingsStatus.textContent = "Collections\u2026";
    }
    try {
      const payload = await listCollections(settings);
      collections = normalizeCollections(payload);
      syncCollectionUi(settings.defaultPlatformProjectId);
      if (showStatus) {
        els.settingsStatus.textContent = `${collections.length} Collection(s)`;
      }
    } catch (error) {
      if (showStatus) {
        els.settingsStatus.textContent = error instanceof Error ? error.message : String(error);
      }
      showBanner(error instanceof Error ? error.message : String(error), "error");
    }
  }
  function buildHitRow(settings, hit, posterUrl) {
    const row = document.createElement("article");
    row.className = "hit";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = selected.has(hit.id);
    check.onchange = () => {
      if (check.checked) selected.add(hit.id);
      else selected.delete(hit.id);
      updateSelectionChrome();
    };
    const img = document.createElement("img");
    img.alt = "";
    if (posterUrl) img.src = posterUrl;
    else img.classList.add("hit-ph");
    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "hit-title";
    title.textContent = hit.mediaFilename;
    const meta = document.createElement("div");
    meta.className = "hit-meta";
    const timing = sceneHitTimingLabel(hit);
    const duration = sceneHitDurationLabel(hit);
    const rank = formatRank(hit.rank);
    meta.textContent = [
      hit.projectName,
      timing,
      duration ? `\u0394 ${duration}` : null,
      hit.sceneKey,
      rank ? `rank ${rank}` : null
    ].filter(Boolean).join(" \xB7 ");
    const snippet = document.createElement("div");
    snippet.className = "hit-meta";
    snippet.textContent = hit.searchText;
    const actions = document.createElement("div");
    actions.className = "hit-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "In VIDEON \xF6ffnen";
    open.onclick = () => {
      const href = absoluteProductHref(settings, hit.href);
      if (!href) {
        showBanner("Kein Deep Link am Treffer.", "error");
        return;
      }
      void openExternal(href);
    };
    actions.append(open);
    body.append(title, meta, snippet, actions);
    row.append(check, img, body);
    return row;
  }
  async function renderHits(settings, signal) {
    revokeBlobs();
    els.resultsCount.textContent = String(hits.length);
    if (!hits.length) {
      els.resultsList.innerHTML = '<p class="empty">Keine Treffer.</p>';
      updateSelectionChrome();
      return;
    }
    els.resultsList.innerHTML = "";
    const posters = await Promise.all(
      hits.map(async (hit) => {
        try {
          const blob = await loadPosterForHit(settings, hit, signal);
          if (!blob) return null;
          const url = URL.createObjectURL(blob);
          blobUrls.push(url);
          return url;
        } catch {
          return null;
        }
      })
    );
    if (signal?.aborted) return;
    hits.forEach((hit, index) => {
      els.resultsList.append(buildHitRow(settings, hit, posters[index]));
    });
    updateSelectionChrome();
  }
  async function runSearch() {
    const settings = saveSettings(readFormSettings());
    const q = els.searchInput.value.trim();
    if (!q) {
      showBanner("Suchbegriff eingeben.", "error");
      return;
    }
    if (!settings.apiToken) {
      showBanner("API Token in den Einstellungen setzen.", "error");
      els.settingsPanel.classList.remove("hidden");
      return;
    }
    if (!looksLikeApiToken(settings.apiToken)) {
      showBanner("Token sieht ung\xFCltig aus (erwartet videon_\u2026).", "error");
    }
    searchAbort?.abort();
    searchAbort = new AbortController();
    const { signal } = searchAbort;
    showBanner("Suche\u2026");
    selected.clear();
    setBusy(true);
    saveLastQuery(q);
    try {
      const payload = await searchMedia(settings, q, 40, signal);
      hits = dedupeSearchHits(
        (payload.items || []).map(normalizeSearchHit).filter((h) => h.mediaAssetId)
      );
      await renderHits(settings, signal);
      const scope = payload.scope ? ` \xB7 ${payload.scope}` : "";
      showBanner(
        hits.length ? `${hits.length} Treffer${scope}` : "Keine Treffer",
        hits.length ? "ok" : ""
      );
    } catch (error) {
      if (error?.name === "AbortError") return;
      hits = [];
      await renderHits(settings, signal);
      showBanner(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }
  async function runDryDownload() {
    const settings = saveSettings(readFormSettings());
    const chosen = hits.filter((h) => selected.has(h.id));
    if (!chosen.length) return;
    els.progress.classList.remove("hidden");
    els.progressBar.style.width = "0%";
    setBusy(true);
    try {
      for (let i = 0; i < chosen.length; i += 1) {
        const hit = chosen[i];
        showBanner(`Download-Check ${i + 1}/${chosen.length}: ${hit.mediaFilename}`);
        const download = await requestAdobeDownload(settings, hit);
        if (!download?.downloadUrl || !download?.cacheKey) {
          throw new Error("Download-Response unvollst\xE4ndig");
        }
        try {
          await materializeDownload({
            cacheKey: download.cacheKey,
            downloadUrl: download.downloadUrl,
            filename: download.filename
          });
          showBanner(`Download + Cache OK: ${download.filename}`, "ok");
          void refreshCacheUi(false);
        } catch (cacheError) {
          console.warn("[VIDEON] cache optional for dry-run", cacheError);
          showBanner(
            `Download OK (${download.kind}, ${download.bytes || "?"} B) \u2014 Cache: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`,
            "ok"
          );
        }
        els.progressBar.style.width = `${Math.round((i + 1) / chosen.length * 100)}%`;
      }
    } catch (error) {
      showBanner(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
      setTimeout(() => els.progress.classList.add("hidden"), 800);
    }
  }
  async function runInsert() {
    const settings = saveSettings(readFormSettings());
    const chosen = hits.filter((h) => selected.has(h.id));
    if (!chosen.length) return;
    els.progress.classList.remove("hidden");
    els.progressBar.style.width = "0%";
    setBusy(true);
    const notes = [];
    const ae = isAfterEffectsHost(hostInfo);
    if (ae) aeCursorSec = 0;
    try {
      for (let i = 0; i < chosen.length; i += 1) {
        const hit = chosen[i];
        showBanner(`Lade ${i + 1}/${chosen.length}: ${hit.mediaFilename}`);
        const download = await requestAdobeDownload(settings, hit);
        const filePath = await materializeDownload({
          cacheKey: download.cacheKey,
          downloadUrl: download.downloadUrl,
          filename: download.filename
        });
        showBanner(`Import ${i + 1}/${chosen.length}: ${hit.mediaFilename}`);
        const result = ae ? await insertHitIntoAfterEffects({
          filePath,
          compName: settings.compName,
          hit,
          sequential: settings.aeSequential !== false,
          gapFrames: settings.aeGapFrames,
          startAtSec: aeCursorSec,
          allowPlan: hostInfo.source === "preview"
        }) : await insertHitIntoPremiere({
          filePath,
          binName: settings.binName,
          hit,
          appendToSequence: els.appendSequence?.checked
        });
        if (!result.ok) throw new Error(result.message);
        if (ae && result.plan && settings.aeSequential !== false) {
          const duration = result.plan.durationSec != null ? result.plan.durationSec : Math.max(0, ((hit.endMs ?? 0) - (hit.startMs ?? 0)) / 1e3) || 1;
          const gapSec = (Number(settings.aeGapFrames) || 0) / 25;
          aeCursorSec = result.plan.compTimeSec + duration + gapSec;
        }
        notes.push(result.message);
        els.progressBar.style.width = `${Math.round((i + 1) / chosen.length * 100)}%`;
      }
      void refreshCacheUi(false);
      showBanner(notes[notes.length - 1] || `${chosen.length} Clip(s) verarbeitet.`, "ok");
    } catch (error) {
      showBanner(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
      setTimeout(() => els.progress.classList.add("hidden"), 800);
    }
  }
  function on(el, eventName, handler) {
    if (!el) return;
    const key = `on${eventName}`;
    const previous = typeof el[key] === "function" ? el[key] : null;
    el[key] = (event) => {
      try {
        if (previous) previous.call(el, event);
        handler(event);
      } catch (error) {
        console.error("[VIDEON] handler", eventName, error);
        showBanner(error instanceof Error ? error.message : String(error), "error");
      }
    };
  }
  function bindPanel() {
    on(els.settingsToggle, "click", () => {
      els.settingsPanel?.classList.toggle("hidden");
      if (els.settingsPanel && !els.settingsPanel.classList.contains("hidden")) void refreshCacheUi(false);
    });
    on(els.settingsSave, "click", () => {
      const draft = readFormSettings();
      const urlCheck = normalizeProductBaseUrl(draft.productBaseUrl);
      if (!urlCheck.ok) {
        if (els.settingsStatus) {
          els.settingsStatus.hidden = false;
          els.settingsStatus.textContent = urlCheck.error;
        }
        return;
      }
      const settings = saveSettings({ ...draft, productBaseUrl: urlCheck.value });
      applySettingsToForm(settings);
      if (els.settingsStatus) {
        els.settingsStatus.hidden = false;
        els.settingsStatus.textContent = looksLikeApiToken(settings.apiToken) ? "Gespeichert." : "Gespeichert \u2014 Token-Format pr\xFCfen (videon_\u2026).";
      }
    });
    on(els.testConnection, "click", () => {
      void (async () => {
        const settings = saveSettings(readFormSettings());
        if (els.settingsStatus) {
          els.settingsStatus.hidden = false;
          els.settingsStatus.textContent = "Teste\u2026";
        }
        try {
          const ok = await testHealth(settings);
          if (els.settingsStatus) {
            els.settingsStatus.textContent = ok ? "Health OK" : "Health fehlgeschlagen";
          }
          if (ok) await refreshCollections(false);
        } catch (error) {
          if (els.settingsStatus) {
            els.settingsStatus.textContent = error instanceof Error ? error.message : String(error);
          }
        }
      })();
    });
    on(els.reloadCollections, "click", () => {
      void refreshCollections(true);
    });
    on(els.cacheRefresh, "click", () => {
      void refreshCacheUi(true);
    });
    on(els.cacheClear, "click", () => {
      void (async () => {
        if (els.settingsStatus) {
          els.settingsStatus.hidden = false;
          els.settingsStatus.textContent = "Cache wird geleert\u2026";
        }
        try {
          const result = await clearCache();
          updateCacheStatsLabel({ count: 0, bytes: 0 });
          if (els.settingsStatus) {
            els.settingsStatus.textContent = `Cache geleert (${result.deleted} Datei(en) entfernt)`;
          }
        } catch (error) {
          if (els.settingsStatus) {
            els.settingsStatus.textContent = error instanceof Error ? error.message : String(error);
          }
        }
      })();
    });
    on(els.collectionSelect, "change", onCollectionChange);
    on(els.collectionSelectMain, "change", onCollectionChange);
    on(els.selectAllBtn, "click", () => {
      for (const hit of hits) selected.add(hit.id);
      for (const input of els.resultsList?.querySelectorAll('input[type="checkbox"]') || []) {
        input.checked = true;
      }
      updateSelectionChrome();
    });
    on(els.selectNoneBtn, "click", () => {
      selected.clear();
      for (const input of els.resultsList?.querySelectorAll('input[type="checkbox"]') || []) {
        input.checked = false;
      }
      updateSelectionChrome();
    });
    on(els.searchBtn, "click", () => {
      void runSearch();
    });
    on(els.searchInput, "keydown", (event) => {
      if (event.key === "Enter") void runSearch();
    });
    on(els.dryRunBtn, "click", () => {
      void runDryDownload();
    });
    on(els.insertBtn, "click", () => {
      void runInsert();
    });
    try {
      globalThis.videonPanel = {
        toggleSettings() {
          els.settingsPanel?.classList.toggle("hidden");
          if (els.settingsPanel && !els.settingsPanel.classList.contains("hidden")) void refreshCacheUi(false);
        },
        saveSettings() {
          const draft = readFormSettings();
          const urlCheck = normalizeProductBaseUrl(draft.productBaseUrl);
          if (!urlCheck.ok) {
            if (els.settingsStatus) {
              els.settingsStatus.hidden = false;
              els.settingsStatus.textContent = urlCheck.error;
            }
            return;
          }
          const settings = saveSettings({ ...draft, productBaseUrl: urlCheck.value });
          applySettingsToForm(settings);
          if (els.settingsStatus) {
            els.settingsStatus.hidden = false;
            els.settingsStatus.textContent = looksLikeApiToken(settings.apiToken) ? "Gespeichert." : "Gespeichert \u2014 Token-Format pr\xFCfen (videon_\u2026).";
          }
        },
        testConnection() {
          void (async () => {
            const settings = saveSettings(readFormSettings());
            if (els.settingsStatus) {
              els.settingsStatus.hidden = false;
              els.settingsStatus.textContent = "Teste\u2026";
            }
            try {
              const ok = await testHealth(settings);
              if (els.settingsStatus) {
                els.settingsStatus.textContent = ok ? "Health OK" : "Health fehlgeschlagen";
              }
              if (ok) await refreshCollections(false);
            } catch (error) {
              if (els.settingsStatus) {
                els.settingsStatus.textContent = error instanceof Error ? error.message : String(error);
              }
            }
          })();
        },
        reloadCollections() {
          void refreshCollections(true);
        },
        search() {
          void runSearch();
        }
      };
    } catch {
    }
  }
  function bootPanel() {
    els = queryEls();
    const missing = missingRequiredEls();
    if (missing.length) {
      const msg = `Panel-DOM unvollst\xE4ndig (${missing.join(", ")}). Bundle neu bauen / Plugin neu laden.`;
      console.error("[VIDEON]", msg);
      if (els.bootStatus) {
        els.bootStatus.hidden = false;
        els.bootStatus.textContent = msg;
      }
      return false;
    }
    bindPanel();
    if (els.panelVersion) els.panelVersion.textContent = `v${PANEL_VERSION}`;
    applySettingsToForm(loadSettings());
    if (els.searchInput) els.searchInput.value = loadLastQuery();
    updateCacheStatsLabel(getCacheStats());
    void refreshCacheUi(false);
    void detectHostApp().then((info) => {
      hostInfo = info;
      applyHostChrome();
    });
    if (loadSettings().apiToken) {
      void refreshCollections(false);
    }
    if (els.bootStatus) {
      els.bootStatus.hidden = true;
      els.bootStatus.textContent = "";
    }
    return true;
  }
  function scheduleBoot(attempt = 0) {
    if (bootPanel()) return;
    if (attempt >= 40) {
      console.error("[VIDEON] Panel boot failed after retries");
      return;
    }
    setTimeout(() => scheduleBoot(attempt + 1), 50);
  }
  scheduleBoot();
})();
